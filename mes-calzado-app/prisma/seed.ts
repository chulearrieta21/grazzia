import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Start seeding...')

  // 1. Limpiar base de datos
  await prisma.productionMovement.deleteMany()
  await prisma.productionBatch.deleteMany()
  await prisma.productionOrder.deleteMany()
  await prisma.user.deleteMany()
  await prisma.process.deleteMany()
  await prisma.referenceRate.deleteMany()

  // 2. Crear Usuarios (Roles requeridos)
  await prisma.user.createMany({
    data: [
      { name: 'Admin Principal', role: 'ADMIN', qrCode: 'QR-ADMIN-01' },
      { name: 'Jefe Producción', role: 'JEFE', qrCode: 'QR-JEFE-01' },
      { name: 'Juan Perez', role: 'OPERARIO', qrCode: 'QR-OPE-001' },
      { name: 'Maria Gomez', role: 'OPERARIO', qrCode: 'QR-OPE-002' },
      { name: 'Carlos Ruiz', role: 'OPERARIO', qrCode: 'QR-OPE-003' }
    ]
  })
  console.log('Usuarios creados.')

  // 3. Crear Procesos en orden secuencial con tarifas de ejemplo
  const processes = [
    { code: 'PIC', name: 'Picado', sequence: 1, ratePerPair: 1.2 },
    { code: 'GUA', name: 'Guarnizado', sequence: 2, ratePerPair: 1.5 },
    { code: 'REC', name: 'Recamado', sequence: 3, ratePerPair: 0.6 },
    { code: 'MON', name: 'Montado', sequence: 4, ratePerPair: 2.0 },
    { code: 'PEG', name: 'Pegado', sequence: 5, ratePerPair: 1.8 },
    { code: 'DET', name: 'Detallado', sequence: 6, ratePerPair: 0.9 },
    { code: 'DES', name: 'Despachado', sequence: 7, ratePerPair: 0.4 }
  ]

  await prisma.process.createMany({ data: processes })
  console.log('Procesos productivos creados.')

  // 4. Crear Órdenes Reales (Basadas en la imagen de GRAZZIA)
  const realOrders = [
    { id: '0462', client: 'GANGAZO', reference: '26304', color: 'NEGRO', totalQuantity: 9, sole: 'TACON 3,5', sizes: '35:1, 36:1, 37:2, 38:2, 39:2, 40:1', observations: 'URGENTE', status: 'PENDING' },
    { id: '0463', client: 'GANGAZO', reference: '26304', color: 'TALCO', totalQuantity: 9, sole: 'TACON 3,5', sizes: '35:1, 36:1, 37:2, 38:2, 39:2, 40:1', observations: 'URGENTE', status: 'PENDING' },
    { id: '0464', client: 'GANGAZO', reference: '26300', color: 'NEGRO', totalQuantity: 9, sole: 'TACON 3,5', sizes: '35:1, 36:1, 37:2, 38:2, 39:2, 40:1', observations: 'URGENTE', status: 'PENDING' }
  ]

  await prisma.productionOrder.createMany({ data: realOrders })

  // 5. Generar Lotes (Canastas) para esas órdenes reales
  // Como son 9 pares por orden, crearemos 1 canasta de 9 pares por cada orden
  await prisma.productionBatch.createMany({
    data: [
      { id: 'B-0462-01', orderId: '0462', quantity: 9 },
      { id: 'B-0463-01', orderId: '0463', quantity: 9 },
      { id: 'B-0464-01', orderId: '0464', quantity: 9 }
    ]
  })

  // 6. Cargar Tarifas por Referencia
  const referenceRates = [
    { type: 'plana', reference: '26000', value: 825, status: 'ACTIVE' },
    { type: 'plana', reference: '26001', value: 440, status: 'ACTIVE' },
    { type: 'plana', reference: '26002', value: 1375, status: 'ACTIVE' },
    { type: 'plana', reference: '26003', value: 1375, status: 'ACTIVE' },
    { type: 'plana', reference: '26004', value: 1375, status: 'ACTIVE' },
    { type: 'plana', reference: '26005', value: 1375, status: 'ACTIVE' },
    { type: 'plana', reference: '26006', value: 1375, status: 'ACTIVE' },
    { type: 'plana', reference: '26007', value: 1650, status: 'ACTIVE' },
    { type: 'plana', reference: '26008', value: 0, status: 'ANULADO' },
    { type: 'plana', reference: '26009', value: 1650, status: 'ACTIVE' },
    { type: 'plana', reference: '26010', value: 1375, status: 'ACTIVE' },
    { type: 'plana', reference: '26016', value: 0, status: 'ANULADO' },
    { type: 'plana', reference: '26017', value: 0, status: 'ACTIVE' },
    { type: 'plana', reference: '26018', value: 440, status: 'ACTIVE' },
    { type: 'plana', reference: '26019', value: 1650, status: 'ACTIVE' },
    { type: 'confort', reference: '26100', value: 825, status: 'ACTIVE' },
    { type: 'confort', reference: '26101', value: 1375, status: 'ACTIVE' },
    { type: 'confort', reference: '26102', value: 0, status: 'ANULADO' },
    { type: 'confort', reference: '26103', value: 1375, status: 'ACTIVE' },
    { type: 'confort', reference: '26104', value: 440, status: 'ACTIVE' },
    { type: 'confort', reference: '26105', value: 1375, status: 'ACTIVE' },
    { type: 'confort', reference: '26106', value: 440, status: 'ACTIVE' },
    { type: 'confort', reference: '26107', value: 0, status: 'ACTIVE' },
    { type: 'confort', reference: '26108', value: 825, status: 'ACTIVE' },
    { type: 'confort', reference: '26109', value: 0, status: 'ACTIVE' },
    { type: 'confort', reference: '26110', value: 440, status: 'ACTIVE' },
    { type: 'confort', reference: '26111', value: 1375, status: 'ACTIVE' },
    { type: 'confort', reference: '26112', value: 440, status: 'ACTIVE' },
    { type: 'confort', reference: '26113', value: 1650, status: 'ACTIVE' },
    { type: 'confort', reference: '26114', value: 1650, status: 'ACTIVE' },
    { type: 'confort', reference: '26115', value: 1375, status: 'ACTIVE' },
    { type: 'señorial', reference: '26200', value: 1375, status: 'ACTIVE' },
    { type: 'señorial', reference: '26201', value: 1375, status: 'ACTIVE' },
    { type: 'señorial', reference: '26202', value: 1375, status: 'ACTIVE' },
    { type: 'señorial', reference: '26203', value: 1375, status: 'ACTIVE' },
    { type: 'señorial', reference: '26204', value: 1375, status: 'ACTIVE' },
    { type: 'señorial', reference: '26205', value: 1375, status: 'ACTIVE' },
    { type: 'señorial', reference: '26206', value: 0, status: 'ACTIVE' },
    { type: 'señorial', reference: '26207', value: 1375, status: 'ACTIVE' },
    { type: 'señorial', reference: '26208', value: 825, status: 'ACTIVE' },
    { type: 'tacon', reference: '26300', value: 1375, status: 'ACTIVE' },
    { type: 'tacon', reference: '26301', value: 1375, status: 'ACTIVE' },
    { type: 'tacon', reference: '26302', value: 1650, status: 'ACTIVE' },
    { type: 'tacon', reference: '26303', value: 1375, status: 'ACTIVE' },
    { type: 'tacon', reference: '26304', value: 1375, status: 'ACTIVE' },
    { type: 'tacon', reference: '26305', value: 1375, status: 'ACTIVE' },
    { type: 'tacon', reference: '26306', value: 1650, status: 'ACTIVE' },
    { type: 'tacon', reference: '26307', value: 1100, status: 'ACTIVE' },
    { type: 'tacon', reference: '26309', value: 1650, status: 'ACTIVE' },
  ]

  await prisma.referenceRate.createMany({ data: referenceRates })
  console.log('Tarifas por Referencia cargadas exitosamente.')

  console.log('Órdenes Reales de GRAZZIA (0462, 0463, 0464) y Lotes creados.')
  console.log('Seeding finished.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
