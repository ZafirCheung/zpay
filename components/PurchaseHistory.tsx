"use client";

import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";

// 交易记录类型
interface Transaction {
  id: string;
  product_id: string;
  name: string;
  out_trade_no: string;
  trade_no: string | null;
  money: number;
  type: string;
  status: string;
  is_subscription: boolean;
  subscription_period: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export default function PurchaseHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingOrderNo, setPayingOrderNo] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const { data, error } = await supabase
          .from("zpay_transactions")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("获取交易记录失败:", error);
          return;
        }

        setTransactions(data || []);
      } catch (error) {
        console.error("获取交易记录失败:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [supabase]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            待支付
          </span>
        );
      case "paid":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            已支付
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            失败
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  const getPaymentTypeLabel = (type: string) => {
    return type === "alipay" ? "支付宝" : type === "wxpay" ? "微信支付" : type;
  };

  // 待支付订单 → 跳转支付
  const handlePendingPayment = async (transaction: Transaction) => {
    setPayingOrderNo(transaction.out_trade_no);
    try {
      const response = await fetch("/api/checkout/providers/zpay/repay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outTradeNo: transaction.out_trade_no }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("获取支付链接失败: " + (data.error || "未知错误"));
      }
    } catch (error) {
      console.error("跳转支付失败:", error);
      alert("跳转支付失败，请稍后重试");
    } finally {
      setPayingOrderNo(null);
    }
  };

  // 已支付订单 → 显示详情
  const handlePaidDetail = (transaction: Transaction) => {
    const details = [
      `订单号: ${transaction.out_trade_no}`,
      transaction.trade_no ? `支付平台订单号: ${transaction.trade_no}` : null,
      `产品名称: ${transaction.name}`,
      `支付金额: ¥${transaction.money}`,
      `支付方式: ${getPaymentTypeLabel(transaction.type)}`,
      `购买时间: ${formatDate(transaction.created_at)}`,
      transaction.is_subscription
        ? `订阅类型: ${transaction.subscription_period === "monthly" ? "月付" : "年付"}`
        : `订单类型: 一次性购买`,
      transaction.subscription_start_date
        ? `订阅开始: ${formatDate(transaction.subscription_start_date)}`
        : null,
      transaction.subscription_end_date
        ? `订阅到期: ${formatDate(transaction.subscription_end_date)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    alert(details);
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="h3 font-cabinet-grotesk mb-4">购买历史</h2>
        <p className="text-gray-500 text-center py-8">加载中...</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h2 className="h3 font-cabinet-grotesk mb-4">购买历史</h2>

      {transactions.length === 0 ? (
        <p className="text-gray-500 text-center py-8">暂无购买记录</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="pb-3 pr-4 text-sm font-semibold text-gray-600">
                  产品名称
                </th>
                <th className="pb-3 pr-4 text-sm font-semibold text-gray-600">
                  购买日期
                </th>
                <th className="pb-3 pr-4 text-sm font-semibold text-gray-600">
                  价格
                </th>
                <th className="pb-3 pr-4 text-sm font-semibold text-gray-600">
                  状态
                </th>
                <th className="pb-3 text-sm font-semibold text-gray-600">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <td className="py-4 pr-4">
                    <div className="font-medium text-gray-900">{tx.name}</div>
                    {tx.is_subscription && (
                      <div className="text-xs text-gray-500 mt-1">
                        {tx.subscription_period === "monthly"
                          ? "月付订阅"
                          : "年付订阅"}
                      </div>
                    )}
                  </td>
                  <td className="py-4 pr-4 text-sm text-gray-600">
                    {formatDate(tx.created_at)}
                  </td>
                  <td className="py-4 pr-4 text-sm font-medium text-gray-900">
                    ¥{tx.money}
                  </td>
                  <td className="py-4 pr-4 text-sm">
                    {getStatusLabel(tx.status)}
                  </td>
                  <td className="py-4">
                    {tx.status === "pending" ? (
                      <button
                        onClick={() => handlePendingPayment(tx)}
                        disabled={payingOrderNo === tx.out_trade_no}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {payingOrderNo === tx.out_trade_no
                          ? "跳转中..."
                          : "去支付"}
                      </button>
                    ) : tx.status === "paid" ? (
                      <button
                        onClick={() => handlePaidDetail(tx)}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-300 hover:bg-blue-50 rounded-md transition-colors"
                      >
                        查看详情
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
