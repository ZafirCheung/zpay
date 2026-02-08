import { NextRequest, NextResponse } from "next/server";
import { createServerAdminClient } from "@/utils/supabase/server";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

/**
 * zpay 签名算法：
 * 1. 将参数按 key 的 ASCII 码从小到大排序
 * 2. 排除 sign、sign_type 和空值
 * 3. 拼接成 a=b&c=d 格式
 * 4. 末尾追加密钥后进行 MD5 加密
 */
function getVerifyParams(params: Record<string, string>): string {
  const sPara: [string, string][] = [];
  for (const key in params) {
    if (!params[key] || key === "sign" || key === "sign_type") {
      continue;
    }
    sPara.push([key, params[key]]);
  }
  sPara.sort((a, b) => a[0].localeCompare(b[0]));
  return sPara.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * GET /api/checkout/providers/zpay/webhook
 * zpay 支付结果异步通知回调接口
 *
 * 接收 zpay 服务器发来的支付结果通知，验签后更新订单状态。
 * 处理要点：
 *   1. 签名验证 —— 防止伪造通知
 *   2. 金额校验 —— 防止金额篡改
 *   3. 幂等处理 —— 防止重复更新
 *   4. 并发安全 —— 条件更新避免竞态
 *   5. 订阅续期 —— 自动计算叠加的订阅时间
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // =============================================
    // 1. 提取所有回调参数
    // =============================================
    const pid = searchParams.get("pid") || "";
    const name = searchParams.get("name") || "";
    const money = searchParams.get("money") || "";
    const outTradeNo = searchParams.get("out_trade_no") || "";
    const tradeNo = searchParams.get("trade_no") || "";
    const param = searchParams.get("param") || "";
    const tradeStatus = searchParams.get("trade_status") || "";
    const type = searchParams.get("type") || "";
    const sign = searchParams.get("sign") || "";

    // =============================================
    // 2. 签名验证
    // =============================================
    // 构建验签参数（排除 sign、sign_type 和空值）
    const verifyParams: Record<string, string> = {};
    if (pid) verifyParams.pid = pid;
    if (name) verifyParams.name = name;
    if (money) verifyParams.money = money;
    if (outTradeNo) verifyParams.out_trade_no = outTradeNo;
    if (tradeNo) verifyParams.trade_no = tradeNo;
    if (param) verifyParams.param = param;
    if (tradeStatus) verifyParams.trade_status = tradeStatus;
    if (type) verifyParams.type = type;

    const key = process.env.ZPAY_KEY;
    if (!key) {
      console.error("缺少 ZPAY_KEY 环境变量");
      return new NextResponse("配置错误", { status: 500 });
    }

    const str = getVerifyParams(verifyParams);
    const expectedSign = crypto
      .createHash("md5")
      .update(str + key)
      .digest("hex");

    if (sign !== expectedSign) {
      console.error("签名验证失败:", {
        receivedSign: sign,
        expectedSign,
        signString: str,
      });
      return new NextResponse("签名验证失败", { status: 400 });
    }

    // =============================================
    // 3. 检查支付状态
    // =============================================
    // 只有 TRADE_SUCCESS 才是支付成功，其他状态直接返回 success 表示收到
    if (tradeStatus !== "TRADE_SUCCESS") {
      return new NextResponse("success");
    }

    // =============================================
    // 4. 查询订单并校验
    // =============================================
    const adminClient = createServerAdminClient();

    // 查询本地订单记录
    const { data: transaction, error: queryError } = await adminClient
      .from("zpay_transactions")
      .select("*")
      .eq("out_trade_no", outTradeNo)
      .single();

    if (queryError || !transaction) {
      console.error("订单不存在:", outTradeNo, queryError);
      return new NextResponse("订单不存在", { status: 400 });
    }

    // 幂等性检查：如果订单已经是 paid 状态，直接返回 success
    if (transaction.status === "paid") {
      return new NextResponse("success");
    }

    // 校验订单金额是否与商户侧一致，防止"假通知"
    const receivedMoney = parseFloat(money);
    const expectedMoney = parseFloat(transaction.money);
    if (
      isNaN(receivedMoney) ||
      isNaN(expectedMoney) ||
      Math.abs(receivedMoney - expectedMoney) > 0.001
    ) {
      console.error("金额不匹配:", {
        received: money,
        expected: transaction.money,
        outTradeNo,
      });
      return new NextResponse("金额不匹配", { status: 400 });
    }

    // =============================================
    // 5. 构建更新数据
    // =============================================
    const updateData: Record<string, any> = {
      status: "paid",
      trade_no: tradeNo,
      updated_at: new Date().toISOString(),
    };

    // =============================================
    // 6. 处理订阅逻辑
    // =============================================
    if (transaction.is_subscription && transaction.subscription_period) {
      // 查询该用户当前最新的有效订阅（已支付且未过期）
      const { data: existingSubscriptions } = await adminClient
        .from("zpay_transactions")
        .select("subscription_end_date")
        .eq("user_id", transaction.user_id)
        .eq("is_subscription", true)
        .eq("status", "paid")
        .not("subscription_end_date", "is", null)
        .gt("subscription_end_date", new Date().toISOString())
        .order("subscription_end_date", { ascending: false })
        .limit(1);

      // 计算订阅开始时间
      // 如果用户有未过期的订阅，新订阅从已有订阅的结束时间开始叠加
      // 例：用户在 2025-03-15 订阅一个月（到期 2025-04-15），
      //     若在 2025-04-01 又订阅一个月，则新订阅从 2025-04-15 开始，到期 2025-05-15
      let startDate: Date;
      if (existingSubscriptions && existingSubscriptions.length > 0) {
        startDate = new Date(existingSubscriptions[0].subscription_end_date);
      } else {
        startDate = new Date();
      }

      // 计算订阅结束时间
      const endDate = new Date(startDate);
      if (transaction.subscription_period === "monthly") {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (transaction.subscription_period === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      updateData.subscription_start_date = startDate.toISOString();
      updateData.subscription_end_date = endDate.toISOString();
    }

    // =============================================
    // 7. 条件更新（并发安全）
    // =============================================
    // 使用 .eq('status', 'pending') 条件确保只有 pending 状态的订单才会被更新
    // 这样即使多个 webhook 并发到达，也只有一个能成功更新
    const { data: updatedRows, error: updateError } = await adminClient
      .from("zpay_transactions")
      .update(updateData)
      .eq("out_trade_no", outTradeNo)
      .eq("status", "pending")
      .select();

    if (updateError) {
      console.error("更新订单失败:", updateError);
      return new NextResponse("更新失败", { status: 500 });
    }

    // 如果没有更新任何行，说明已被其他并发请求处理
    if (!updatedRows || updatedRows.length === 0) {
      console.log("订单已被处理（并发场景）:", outTradeNo);
      return new NextResponse("success");
    }

    console.log("订单支付成功:", {
      outTradeNo,
      tradeNo,
      money,
      userId: transaction.user_id,
      productId: transaction.product_id,
    });

    // 返回 success 告知 zpay 通知已成功处理
    return new NextResponse("success");
  } catch (error) {
    console.error("Webhook 处理失败:", error);
    return new NextResponse("服务器错误", { status: 500 });
  }
}
