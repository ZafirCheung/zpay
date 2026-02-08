"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";

// 产品特性接口
interface ProductFeature {
  id: string;
  text: string;
}

// 产品类型定义
interface Product {
  id: string;
  name: string;
  title: string;
  description: string;
  price: string;
  priceLabel: string;
  isSubscription: boolean;
  subscriptionPeriod?: string;
  features: ProductFeature[];
}

export default function Pricing() {
  const [annual, setAnnual] = useState<boolean>(true);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  // 页面加载时同时获取产品信息和用户登录状态
  useEffect(() => {
    const init = async () => {
      try {
        // 并行获取产品信息和用户信息
        const [productsRes, userRes] = await Promise.all([
          fetch("/api/products").then((res) => res.json()),
          supabase.auth.getUser(),
        ]);

        setProducts(productsRes.products);
        setUser(userRes.data.user);
      } catch (error) {
        console.error("初始化失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    init();

    // 监听登录状态变化（如用户在其他标签页登录/登出）
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 处理支付请求
  const handlePayment = async (productId: string) => {
    // 防止重复点击
    if (loadingProductId) return;

    // 未登录用户直接跳转登录页，并携带当前页面路径以便登录后返回
    if (!user) {
      router.push(`/signin?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    setLoadingProductId(productId);
    try {
      // 请求后端获取支付链接（后端会再次验证登录状态，双重保障）
      const response = await fetch("/api/checkout/providers/zpay/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          payType: "alipay",
        }),
      });

      const data = await response.json();

      // 后端返回 401 说明 session 已过期
      if (response.status === 401) {
        setUser(null);
        router.push(`/signin?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      if (!response.ok || data.error) {
        alert(data.error || "获取支付链接失败，请稍后重试");
        return;
      }

      // 跳转到 zpay 支付页面
      window.location.href = data.url;
    } catch (error) {
      console.error("支付请求失败:", error);
      alert("支付请求失败，请稍后重试");
    } finally {
      setLoadingProductId(null);
    }
  };

  // 获取按钮文案
  const getButtonText = (
    productId: string,
    defaultText: string
  ): string => {
    if (loadingProductId === productId) return "正在跳转支付...";
    if (!user) return `登录后${defaultText}`;
    return defaultText;
  };

  // 显示加载状态
  if (isLoading) {
    return (
      <section className="relative border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="py-12 md:py-20 text-center">
            <p>加载产品信息中...</p>
          </div>
        </div>
      </section>
    );
  }

  // 获取基础版产品
  const basicProduct = products["basic-onetime"];

  // 获取当前选择的专业版产品（年付或月付）
  const proProduct = annual ? products["pro-yearly"] : products["pro-monthly"];
  const proProductId = annual ? "pro-yearly" : "pro-monthly";

  return (
    <section className="relative border-t border-gray-100">
      {/* Bg gradient */}
      <div
        className="absolute top-0 left-0 right-0 bg-gradient-to-b from-gray-50 to-white h-1/2 pointer-events-none -z-10"
        aria-hidden="true"
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="py-12 md:py-20">
          {/* Section header */}
          <div className="max-w-3xl mx-auto text-center pb-12 md:pb-16">
            <h2 className="h2 font-cabinet-grotesk">
              加入AI编程，开启你的AI之旅
            </h2>
          </div>
          {/* Pricing tables */}
          <div>
            {/* Pricing toggle */}
            <div className="flex justify-center max-w-[18rem] m-auto mb-8 lg:mb-16">
              <div className="relative flex w-full mx-6 p-1 bg-gray-200 rounded-full">
                <span
                  className="absolute inset-0 m-1 pointer-events-none"
                  aria-hidden="true"
                >
                  <span
                    className={`absolute inset-0 w-1/2 bg-white rounded-full shadow transform transition duration-150 ease-in-out ${
                      annual ? "translate-x-0" : "translate-x-full"
                    }`}
                  />
                </span>
                <button
                  className={`relative flex-1 text-sm font-medium p-1 transition duration-150 ease-in-out ${
                    annual && "text-gray-500"
                  }`}
                  onClick={() => setAnnual(true)}
                >
                  年付
                </button>
                <button
                  className={`relative flex-1 text-sm font-medium p-1 transition duration-150 ease-in-out ${
                    annual && "text-gray-500"
                  }`}
                  onClick={() => setAnnual(false)}
                >
                  月付
                </button>
              </div>
            </div>
            <div className="max-w-sm mx-auto grid gap-8 lg:grid-cols-2 lg:gap-6 items-start lg:max-w-3xl pt-4">
              {/* Pricing table 1 - 基础版（一次性购买） */}
              {basicProduct && (
                <div
                  className="relative flex flex-col h-full p-6"
                  data-aos="fade-right"
                >
                  <div className="mb-6">
                    <div className="font-cabinet-grotesk text-xl font-semibold mb-1">
                      {basicProduct.title}
                    </div>
                    <div className="font-cabinet-grotesk inline-flex items-baseline mb-2">
                      <span className="text-3xl font-medium">¥</span>
                      <span className="text-5xl font-bold">
                        {basicProduct.price}
                      </span>
                      <span className="font-medium">
                        {basicProduct.priceLabel}
                      </span>
                    </div>
                    <div className="text-gray-500 mb-6">
                      {basicProduct.description}
                    </div>
                    <button
                      className="btn text-white bg-blue-600 hover:bg-blue-700 w-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handlePayment("basic-onetime")}
                      disabled={loadingProductId !== null}
                    >
                      {getButtonText("basic-onetime", "购买")}
                    </button>
                  </div>
                  <div className="font-medium mb-4">包含以下内容：</div>
                  <ul className="text-gray-500 space-y-3 grow">
                    {basicProduct.features.map((feature) => (
                      <li key={feature.id} className="flex items-center">
                        <svg
                          className="w-3 h-3 fill-current text-emerald-500 mr-3 shrink-0"
                          viewBox="0 0 12 12"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                        </svg>
                        <span>{feature.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pricing table 2 - 专业版（订阅模式） */}
              {proProduct && (
                <div
                  className="relative flex flex-col h-full p-6 bg-gray-800"
                  data-aos="fade-left"
                >
                  <div className="absolute top-0 right-0 mr-6 -mt-4">
                    <div className="inline-flex items-center text-sm font-semibold py-1 px-4 text-emerald-600 bg-emerald-200 rounded-full">
                      最受欢迎
                    </div>
                  </div>
                  <div className="mb-6">
                    <div className="font-cabinet-grotesk text-xl text-gray-100 font-semibold mb-1">
                      {proProduct.title}
                    </div>
                    <div className="font-cabinet-grotesk text-gray-100 inline-flex items-baseline mb-2">
                      <span className="text-3xl font-medium text-gray-400">
                        ¥
                      </span>
                      <span className="text-5xl font-bold">
                        {proProduct.price}
                      </span>
                      <span className="font-medium text-gray-400">
                        {proProduct.priceLabel}
                      </span>
                    </div>
                    <div className="text-gray-400 mb-6">
                      {proProduct.description}
                    </div>
                    <button
                      className="btn text-white bg-blue-600 hover:bg-blue-700 w-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handlePayment(proProductId)}
                      disabled={loadingProductId !== null}
                    >
                      {getButtonText(proProductId, "订阅")}
                    </button>
                  </div>
                  <div className="font-medium text-gray-100 mb-4">
                    基础版全部内容，外加：
                  </div>
                  <ul className="text-gray-400 space-y-3 grow">
                    {proProduct.features.map((feature) => (
                      <li key={feature.id} className="flex items-center">
                        <svg
                          className="w-3 h-3 fill-current text-emerald-500 mr-3 shrink-0"
                          viewBox="0 0 12 12"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                        </svg>
                        <span>{feature.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
