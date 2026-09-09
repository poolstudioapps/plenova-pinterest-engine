import "server-only";
import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/errors";

/**
 * Route helpers. Every handler runs inside `handle` so a thrown AppError turns
 * into a consistent JSON envelope and an unexpected throw never leaks a stack.
 */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export async function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
