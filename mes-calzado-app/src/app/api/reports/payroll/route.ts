import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    // Obtener todos los movimientos con sus procesos, usuarios, y la orden (para sacar la referencia)
    const movements = await prisma.productionMovement.findMany({
      include: {
        user: true,
        process: true,
        batch: {
          include: {
            order: true
          }
        }
      }
    })

    // Obtener todas las tarifas de referencia
    const referenceRates = await prisma.referenceRate.findMany({
      where: { status: 'ACTIVE' }
    })
    
    const rateMap = new Map()
    referenceRates.forEach(r => rateMap.set(r.reference, r.value))

    // Agrupar y calcular pago por operario
    const payroll: Record<string, any> = {}

    movements.forEach(m => {
      if (!payroll[m.userId]) {
        payroll[m.userId] = {
          userId: m.userId,
          name: m.user.name,
          totalPairs: 0,
          totalEarned: 0,
          processesCount: {}
        }
      }

      const userRecord = payroll[m.userId]
      const reference = m.batch.order.reference
      
      // Buscar si la referencia tiene una tarifa dinámica, si no, usar la del proceso por defecto
      const dynamicRate = rateMap.get(reference)
      const finalRate = dynamicRate !== undefined ? dynamicRate : m.process.ratePerPair

      userRecord.totalPairs += m.batch.quantity
      userRecord.totalEarned += (m.batch.quantity * finalRate)
      
      if (!userRecord.processesCount[m.process.name]) {
        userRecord.processesCount[m.process.name] = 0
      }
      userRecord.processesCount[m.process.name] += m.batch.quantity
    })

    return NextResponse.json(Object.values(payroll))
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Error calculating payroll' }, { status: 500 })
  }
}
