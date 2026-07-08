import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    const movements = await prisma.productionMovement.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50,
      include: {
        user: true,
        batch: {
          include: { order: true }
        },
        process: true
      }
    })
    return NextResponse.json(movements)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Error fetching movements' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { batchId, userQr } = body

    if (!batchId || !userQr) {
      return NextResponse.json({ error: 'Faltan códigos de escaneo (QR Operario o QR Canasta)' }, { status: 400 })
    }

    // Authenticate worker by QR
    const user = await prisma.user.findUnique({
      where: { qrCode: userQr }
    })

    if (!user) {
      return NextResponse.json({ error: 'Código QR de Operario Inválido' }, { status: 401 })
    }

    // Find the batch
    const batch = await prisma.productionBatch.findUnique({
      where: { id: batchId },
      include: { order: true, movements: { include: { process: true } } }
    })

    if (!batch) {
      return NextResponse.json({ error: 'Lote/Canasta no encontrado' }, { status: 404 })
    }

    // Prevención de fraude: un operario no puede tener múltiples roles (procesos) en el mismo lote
    const existingMovement = batch.movements.find(m => m.userId === user.id)
    if (existingMovement) {
      return NextResponse.json({ 
        error: `El operario ya participó en este lote en el proceso de ${existingMovement.process.name}. No puede registrar otro rol.` 
      }, { status: 403 })
    }

    // Determinar cuál es el siguiente proceso que le toca a esta canasta
    // Basado en la secuencia más alta que ya tiene registrada.
    const lastMovement = await prisma.productionMovement.findFirst({
      where: { batchId: batch.id },
      orderBy: { process: { sequence: 'desc' } },
      include: { process: true }
    })

    const nextSequence = lastMovement ? lastMovement.process.sequence + 1 : 1

    // Buscar el proceso que corresponda a esa secuencia
    const nextProcess = await prisma.process.findFirst({
      where: { sequence: nextSequence }
    })

    if (!nextProcess) {
      return NextResponse.json({ error: 'Esta canasta ya completó todos los procesos de producción.' }, { status: 400 })
    }

    // Create movement
    const movement = await prisma.productionMovement.create({
      data: {
        batchId: batch.id,
        processId: nextProcess.id,
        userId: user.id
      },
      include: { process: true }
    })

    return NextResponse.json({
      message: `Registrado exitosamente en: ${nextProcess.name}`,
      movement
    }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Error interno del servidor o posible duplicado.' }, { status: 500 })
  }
}
