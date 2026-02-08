import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServerAdminClient,
} from "@/utils/supabase/server";
import { products } from "@/lib/products";
import crypto from "crypto";

/**
 * 生成订单号：YYYYMMDDHHmmss + 3位随机数
 */
function generateOrderNo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return timestamp + random;
}

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
 * POST /api/checkout/providers/zpay/url
 * 前端调用此接口获取 zpay 支付链接
 *
 * Request Body:
 *   - productId: string  产品ID
 *   - payType: string    支付方式 (alipay | wxpay)，默认 alipay
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
    const { productId, payType = "alipay" } = body;

    // 验证支付方式
    if (!["alipay", "wxpay"].includes(payType)) {
      return NextResponse.json(
        { error: "不支持的支付方式" },
        { status: 400 }
      );
    }

    // 验证产品是否存在
    const product = products[productId];
    if (!product) {
      return NextResponse.json({ error: "产品不存在" }, { status: 400 });
    }

    // 3. 获取环境变量
    const pid = process.env.ZPAY_PID;
    const key = process.env.ZPAY_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!pid || !key || !baseUrl) {
      console.error("缺少 zpay 配置环境变量: ZPAY_PID, ZPAY_KEY, NEXT_PUBLIC_BASE_URL");
      return NextResponse.json(
        { error: "支付服务配置错误，请联系管理员" },
        { status: 500 }
      );
    }

    // 4. 生成唯一订单号
    const outTradeNo = generateOrderNo();

    // 5. 构建 zpay 请求参数
    const notifyUrl = `${baseUrl}/api/checkout/providers/zpay/webhook`;
    const returnUrl = `${baseUrl}/payment/success`;

    const params: Record<string, string> = {
      pid,
      money: product.price,
      name: product.name,
      notify_url: notifyUrl,
      out_trade_no: outTradeNo,
      return_url: returnUrl,
      type: payType,
    };

    // 6. 生成签名
    const str = getVerifyParams(params);
    const sign = crypto
      .createHash("md5")
      .update(str + key)
      .digest("hex");

    // 7. 使用管理员客户端在数据库中创建待支付订单
    const adminClient = createServerAdminClient();
    const { error: dbError } = await adminClient
      .from("zpay_transactions")
      .insert({
        user_id: user.id,
        product_id: productId,
        out_trade_no: outTradeNo,
        money: parseFloat(product.price),
        name: product.name,
        type: payType,
        status: "pending",
        is_subscription: product.isSubscription,
        subscription_period: product.subscriptionPeriod || null,
      });

    if (dbError) {
      console.error("创建订单失败:", dbError);
      return NextResponse.json(
        { error: "创建订单失败，请稍后重试" },
        { status: 500 }
      );
    }

    // 8. 构建支付链接（使用 URLSearchParams 正确编码参数）
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
