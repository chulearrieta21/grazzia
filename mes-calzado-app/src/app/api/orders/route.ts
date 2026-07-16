import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    const orders = await prisma.productionOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: { batches: true }
    })
    return NextResponse.json(orders)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Error fetching orders' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { id, client, reference, color, totalQuantity, sole, sizes, observations, batchSize, marca } = body
    
    if (!id || !client || !reference || !totalQuantity || !batchSize) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const qty = parseInt(totalQuantity, 10)
    const bSize = parseInt(batchSize, 10)
    
    // Calcular número de lotes
    const numBatches = Math.ceil(qty / bSize)
    const batchesData = []
    
    let remaining = qty
    for (let i = 1; i <= numBatches; i++) {
      const currentBatchQty = remaining > bSize ? bSize : remaining
      batchesData.push({
        id: `${id}-B${i.toString().padStart(3, '0')}`, // Ej: OP001-B001
        quantity: currentBatchQty
      })
      remaining -= currentBatchQty
    }

    const newOrder = await prisma.productionOrder.create({
      data: {
        id,
        client,
        reference,
        color: color || '',
        totalQuantity: qty,
        sole: sole || '',
        sizes: sizes || '',
        observations: observations || '',
        marca: marca || '',
        status: 'PENDING',
        batches: {
          create: batchesData
        }
      },
      include: { batches: true }
    })

    return NextResponse.json(newOrder, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Error creating order' }, { status: 500 })
  }
}
