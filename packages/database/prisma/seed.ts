import { createDatabase } from "../src/index.js";
if (process.env.NODE_ENV === "production")
  throw Error("Development fixtures are disabled in production");
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
const db = createDatabase(process.env.DATABASE_URL);
const fixtures = [
  {
    slug: "everyday-knit",
    title: "The everyday knit",
    category: "Knitwear",
    price: 8900,
    color: "Oat",
    photo: "photo-1434389677669-e08b4cac3105",
  },
  {
    slug: "relaxed-oxford",
    title: "The relaxed Oxford",
    category: "Tops",
    price: 7900,
    color: "Cloud",
    photo: "photo-1598033129183-c4f50c736f10",
  },
  {
    slug: "tailored-trouser",
    title: "The tailored trouser",
    category: "Trousers",
    price: 11900,
    color: "Ink",
    photo: "photo-1624378439575-d8705ad7ae80",
  },
  {
    slug: "layering-coat",
    title: "The layering coat",
    category: "Outerwear",
    price: 21900,
    color: "Sand",
    photo: "photo-1548624149-f3228d2f1ca4",
  },
  {
    slug: "ribbed-cardigan",
    title: "The ribbed cardigan",
    category: "Knitwear",
    price: 9900,
    color: "Sage",
    photo: "photo-1576566588028-4147f3842f27",
  },
  {
    slug: "easy-dress",
    title: "The easy dress",
    category: "Dresses",
    price: 13900,
    color: "Charcoal",
    photo: "photo-1515372039744-b8f02a3ae446",
  },
];
try {
  for (const f of fixtures) {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(180046)`;
      if (await tx.product.findUnique({ where: { slug: f.slug } })) return;
      const product = await tx.product.create({
        data: {
          slug: f.slug,
          title: f.title,
          category: f.category,
          status: "PUBLISHED",
          description:
            "A relaxed silhouette for the everyday. This development fixture is example merchandise; replace its specifications and photography before launch.",
          fabricCare:
            "Development fixture: replace with verified composition and garment-specific care instructions.",
          images: {
            create: {
              storageKey: `fixtures/${f.slug}`,
              url: `https://images.unsplash.com/${f.photo}?auto=format&fit=crop&w=1200&q=85`,
              alt: `${f.title} in ${f.color}`,
            },
          },
          variants: {
            create: ["XS", "S", "M", "L", "XL"].map((size, index) => ({
              sku: `DEV-${f.slug.toUpperCase()}-${size}`,
              size,
              color: f.color,
              priceMinor: f.price,
              inventory: { create: { onHand: index === 4 ? 0 : 12 } },
              movements: {
                create: {
                  delta: index === 4 ? 0 : 12,
                  cause: "DEVELOPMENT_SEED",
                },
              },
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          action: "DEVELOPMENT_PRODUCT_SEEDED",
          target: product.id,
          summary: { fixture: true },
        },
      });
    });
  }
  await db.collection.upsert({
    where: { slug: "everyday-edit" },
    create: {
      slug: "everyday-edit",
      title: "The everyday edit",
      description: "Relaxed silhouettes and quiet essentials.",
      products: {
        create: (
          await db.product.findMany({
            where: { slug: { in: fixtures.slice(0, 3).map((f) => f.slug) } },
            select: { id: true },
          })
        ).map((p) => ({ productId: p.id })),
      },
    },
    update: {},
  });
  console.log(
    "Development fixtures added. Existing records and stock were preserved.",
  );
} finally {
  await db.$disconnect();
}
