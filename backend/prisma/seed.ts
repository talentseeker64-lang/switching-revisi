import { PartnerStatus, PartnerType, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { hashSecret } from '../src/common/utils/password.util.js';

const prisma = new PrismaClient();

const DEV_ADMIN_EMAIL = 'admin@switching.local';
const DEV_ADMIN_PASSWORD = 'ChangeMe123!';

// One per ecosystem party named in proposal §2 "Latar Belakang" - OTHER is
// the doc's open-ended catch-all ("pihak lain yang akan ditambahkan"), not
// a concrete party, so it's not seeded here.
const DUMMY_PARTNERS: Array<{
  code: string;
  name: string;
  type: PartnerType;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}> = [
  {
    code: 'KOP-TANI-MAKMUR',
    name: 'Koperasi Tani Makmur Bersama',
    type: PartnerType.KOPERASI,
    contactName: 'Siti Rahayu',
    contactEmail: 'ops@koptanimakmur.test',
    contactPhone: '081200000001',
  },
  {
    code: 'RG-SENTRA-PANGAN',
    name: 'Resi Gudang Sentra Pangan',
    type: PartnerType.RESI_GUDANG,
    contactName: 'Budi Santoso',
    contactEmail: 'ops@sentrapangan.test',
    contactPhone: '081200000002',
  },
  {
    code: 'TANI-SAWAH-SUBUR',
    name: 'Kelompok Tani Sawah Subur',
    type: PartnerType.PETANI,
    contactName: 'Agus Wijaya',
    contactEmail: 'kontak@sawahsubur.test',
    contactPhone: '081200000003',
  },
  {
    code: 'TERNAK-SAPI-MAKMUR',
    name: 'Peternak Sapi Perah Makmur',
    type: PartnerType.PETERNAK,
    contactName: 'Dedi Kurniawan',
    contactEmail: 'kontak@sapimakmur.test',
    contactPhone: '081200000004',
  },
  {
    code: 'NELAYAN-JAYA-SAMUDRA',
    name: 'Nelayan Jaya Samudra',
    type: PartnerType.NELAYAN,
    contactName: 'Hendra Saputra',
    contactEmail: 'kontak@jayasamudra.test',
    contactPhone: '081200000005',
  },
  {
    code: 'KEBUN-SAWIT-LESTARI',
    name: 'Pekebun Sawit Lestari',
    type: PartnerType.PEKEBUN,
    contactName: 'Rina Marlina',
    contactEmail: 'kontak@sawitlestari.test',
    contactPhone: '081200000006',
  },
  {
    code: 'TOKO-SEMBAKO-BAROKAH',
    name: 'Toko Sembako Barokah',
    type: PartnerType.TOKO_WARUNG,
    contactName: 'Wati Suryani',
    contactEmail: 'kontak@sembakobarokah.test',
    contactPhone: '081200000007',
  },
  {
    code: 'LOGISTIK-CEPAT-NUSANTARA',
    name: 'Logistik Cepat Nusantara',
    type: PartnerType.LOGISTIK,
    contactName: 'Fajar Nugroho',
    contactEmail: 'ops@cepatnusantara.test',
    contactPhone: '081200000008',
  },
  {
    code: 'ALSINTAN-MITRA-TANI',
    name: 'Penyedia Alsintan Mitra Tani',
    type: PartnerType.PENYEDIA_ALSINTAN,
    contactName: 'Yusuf Hakim',
    contactEmail: 'ops@mitratani.test',
    contactPhone: '081200000009',
  },
  {
    code: 'PENGGILINGAN-SUMBER-REJEKI',
    name: 'Penggilingan Padi Sumber Rejeki',
    type: PartnerType.PENGGILINGAN_PADI,
    contactName: 'Slamet Riyadi',
    contactEmail: 'ops@sumberrejeki.test',
    contactPhone: '081200000010',
  },
  {
    code: 'DISTRIBUTOR-PANGAN-NASIONAL',
    name: 'Distributor Pangan Nasional',
    type: PartnerType.DISTRIBUTOR,
    contactName: 'Indra Gunawan',
    contactEmail: 'ops@panganasional.test',
    contactPhone: '081200000011',
  },
  {
    code: 'PG-DIGITAL-PAY',
    name: 'DigitalPay Payment Gateway',
    type: PartnerType.PAYMENT_GATEWAY,
    contactName: 'Lestari Handayani',
    contactEmail: 'integration@digitalpay.test',
    contactPhone: '081200000012',
  },
  {
    code: 'MARKETPLACE-TANI-DIGITAL',
    name: 'TaniDigital Marketplace',
    type: PartnerType.ECOMMERCE_MARKETPLACE,
    contactName: 'Bayu Pratama',
    contactEmail: 'integration@tanidigital.test',
    contactPhone: '081200000013',
  },
];

async function seedAdmin() {
  const existing = await prisma.user.findUnique({ where: { email: DEV_ADMIN_EMAIL } });

  if (existing) {
    console.log(`Admin user already exists: ${DEV_ADMIN_EMAIL}`);
    return;
  }

  const passwordHash = await hashSecret(DEV_ADMIN_PASSWORD);

  await prisma.user.create({
    data: {
      email: DEV_ADMIN_EMAIL,
      passwordHash,
      fullName: 'System Administrator',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  console.log('Seeded development admin user:');
  console.log(`  email:    ${DEV_ADMIN_EMAIL}`);
  console.log(`  password: ${DEV_ADMIN_PASSWORD}`);
  console.log('  CHANGE THIS PASSWORD before any shared/staging/production use.');
}

async function seedPartners() {
  console.log('Seeding dummy ecosystem partners...');

  for (const partner of DUMMY_PARTNERS) {
    await prisma.partner.upsert({
      where: { code: partner.code },
      create: { ...partner, status: PartnerStatus.ACTIVE },
      update: {},
    });
  }

  console.log(`  ${DUMMY_PARTNERS.length} partners ready (one per proposal §2 party, upserted by code).`);
}

async function main() {
  await seedAdmin();
  await seedPartners();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
