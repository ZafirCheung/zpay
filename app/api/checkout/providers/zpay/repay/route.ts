import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import crypto from "crypto";

/**
 * zpay 签名算法（与 url/route.ts 一致）
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
 * POST /api/checkout/providers/zpay/repay
 * 为已存在的待支付订单重新生成支付链接
 *
 * Request Body:
 *   - outTradeNo: string  商户订单号
 *
 * Response:
 *   - { url: string }    zpay 支付链接
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户登录状态
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "请先登录后再进行支付" },
        { status: 401 }
      );
    }

    // 2. 解析请求参数
    const body = await request.json();
    const { outTradeNo } = body;

    if (!outTradeNo) {
      return NextResponse.json(
        { error: "缺少订单号" },
        { status: 400 }
      );
    }

    // 3. 查询待支付订单（RLS 确保只能查到自己的订单）
    const { data: transaction, error: dbError } = await supabase
      .from("zpay_transactions")
      .select("*")
      .eq("out_trade_no", outTradeNo)
      .eq("status", "pending")
      .single();

    if (dbError || !transaction) {
      return NextResponse.json(
        { error: "订单不存在或已支付" },
        { status: 404 }
      );
    }

    // 4. 获取环境变量
    const pid = process.env.ZPAY_PID;
    const key = process.env.ZPAY_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!pid || !key || !baseUrl) {
      console.error("缺少 zpay 配置环境变量");
      return NextResponse.json(
        { error: "支付服务配置错误，请联系管理员" },
        { status: 500 }
      );
    }

    // 5. 重新构建支付链接参数
    const notifyUrl = `${baseUrl}/api/checkout/providers/zpay/webhook`;
    const returnUrl = `${baseUrl}/payment/success`;

    const params: Record<string, string> = {
      pid,
      money: String(transaction.money),
      name: transaction.name,
      notify_url: notifyUrl,
      out_trade_no: transaction.out_trade_no,
      return_url: returnUrl,
      type: transaction.type,
    };

    // 6. 生成签名
    const str = getVerifyParams(params);
    const sign = crypto
      .createHash("md5")
      .update(str + key)
      .digest("hex");

    // 7. 构建支付链接
    const urlParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      urlParams.set(k, v);
    }
    urlParams.set("sign", sign);
    urlParams.set("sign_type", "MD5");

    const paymentUrl = `https://zpayz.cn/submit.php?${urlParams.toString()}`;

    return NextResponse.json({ url: paymentUrl });
  } catch (error) {
    console.error("生成支付链接失败:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}
