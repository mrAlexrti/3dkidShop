import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createNovaPoshtaWaybill } from "@/lib/novaposhta";
import { getOrderStatusAfterTtnCreated } from "@/lib/order-status";

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected Nova Poshta error.";
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") return unauthorized();

  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
  }

  if (order.novaPoshtaTtn) {
    return NextResponse.json({
      success: true,
      ttn: order.novaPoshtaTtn,
      ref: order.novaPoshtaTtnRef,
      alreadyCreated: true,
    });
  }

  try {
    const result = await createNovaPoshtaWaybill(order);

    if (!result.success) {
      await prisma.order.update({
        where: { id: order.id },
        data: { novaPoshtaError: result.error },
      });

      return NextResponse.json(
        { success: false, error: result.error, missingFields: result.missingFields ?? [] },
        { status: result.missingFields?.length ? 400 : 502 },
      );
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: getOrderStatusAfterTtnCreated(order.status),
        novaPoshtaTtn: result.ttn,
        novaPoshtaTtnRef: result.ref,
        novaPoshtaStatus: result.status ?? null,
        novaPoshtaStatusCode: result.statusCode ?? null,
        novaPoshtaCreatedAt: new Date(),
        novaPoshtaError: null,
      },
    });

    return NextResponse.json({ success: true, ttn: result.ttn, ref: result.ref });
  } catch (error) {
    const message = getErrorMessage(error);
    await prisma.order.update({
      where: { id: order.id },
      data: { novaPoshtaError: message },
    });

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}