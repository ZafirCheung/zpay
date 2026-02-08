import { NextResponse } from "next/server";
import { products } from "@/lib/products";

// GET请求处理函数 - 获取所有产品
export async function GET() {
  return NextResponse.json({ products });
}
