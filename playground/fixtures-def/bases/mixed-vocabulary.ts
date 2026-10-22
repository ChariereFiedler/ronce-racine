import type { Fixture } from "../index.js";

export const mixedVocabulary: Fixture = {
  name: "mixed-vocabulary",
  why: "one concept under three names + one name over two concepts → domain-glossary eval",
  files: {
    "package.json": JSON.stringify({ dependencies: { express: "^4.0.0" } }, null, 2),
    "db/schema.sql": "-- The people who buy things are `users` here...\nCREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL);\nCREATE TABLE purchases (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id), position INT);\n",
    "src/customer.ts": "// ...`Customer` here...\nexport interface Customer {\n  id: number\n  email: string\n}\nexport function loadCustomer(id: number): Customer | null {\n  return id > 0 ? { id, email: 'x@y.z' } : null\n}\n",
    "src/routes.ts": "import type { Customer } from './customer'\n\n// ...and `members` on the wire. Three names, one concept.\nexport const routes = {\n  'GET /members/:id': 'loadCustomer',\n  'GET /members/:id/orders': 'listOrders',\n}\n\n// `Order` here means a purchase...\nexport interface Order {\n  id: number\n  buyer: Customer\n}\n",
    "src/sort.ts": "// ...while `order` here means a sort direction. Same word, two concepts.\nexport type Order = 'asc' | 'desc'\nexport function sortBy<T>(rows: T[], key: keyof T, order: Order): T[] {\n  return [...rows].sort((a, b) => (order === 'asc' ? 1 : -1) * String(a[key]).localeCompare(String(b[key])))\n}\n",
    "EXPECTED.md": "# Ground truth\n\nSynonyms - ONE concept carrying three names:\n\n- `users` (table, `db/schema.sql`)\n- `Customer` (type, `src/customer.ts`)\n- `members` (route segment, `src/routes.ts`)\n\nA glossary must resolve these to a single name and list the other two as\nrejected, so a search for any of them lands on the entry.\n\nHomonym - ONE name covering two concepts:\n\n- `Order` in `src/routes.ts` = a purchase\n- `Order` in `src/sort.ts` = a sort direction\n\nOne of the two must be qualified, or each explicitly scoped to its context.\n\nAlso present: the `purchases` table has a `position` column, which is the\nsort-order sense again under a third spelling.\n",
  },
};
