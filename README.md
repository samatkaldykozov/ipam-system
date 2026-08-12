# IPAM — IP Address Management

A modern IP Address Management (IPAM) platform built as a foundation scaffold.
This project intentionally contains **no business logic** — it establishes a
professional, production-ready architecture ready for feature development.

## Tech Stack

| Layer        | Technology                          |
| ------------ | ----------------------------------- |
| Framework    | Next.js 15 (App Router)             |
| Language     | TypeScript                          |
| Styling      | Tailwind CSS + shadcn/ui            |
| ORM          | Prisma                              |
| Database     | PostgreSQL (via Supabase)           |
| Auth         | Supabase Auth (`@supabase/ssr`)     |
| Forms        | React Hook Form + Zod               |
| Tables       | TanStack Table                      |
| Icons        | lucide-react                        |
| Deployment   | Vercel                              |

## Project Structure

```
.
├── app/
│   ├── (app)/                 # Authenticated route group (app shell)
│   │   ├── layout.tsx         # Sidebar + topbar layout
│   │   ├── page.tsx           # Dashboard
│   │   ├── networks/page.tsx  # Networks page
│   │   ├── ip-addresses/page.tsx
│   │   └── settings/page.tsx
│   ├── login/page.tsx         # Login page (standalone)
│   ├── globals.css            # Tailwind + theme tokens
│   └── layout.tsx             # Root layout (fonts, theme provider)
├── components/
│   ├── ui/                    # shadcn/ui primitives
│   ├── sidebar.tsx            # Main navigation
│   ├── topbar.tsx             # Header with theme + account menu
│   ├── theme-provider.tsx
│   ├── theme-toggle.tsx
│   ├── page-header.tsx
│   └── empty-state.tsx
├── lib/
│   ├── prisma.ts              # Prisma client singleton
│   ├── supabase/
│   │   ├── client.ts          # Browser client
│   │   ├── server.ts          # Server client (cookies)
│   │   └── middleware.ts      # Session refresh helper
│   ├── validations.ts         # Zod schemas
│   ├── site-config.ts         # Nav + app metadata
│   └── utils.ts               # cn() helper
├── prisma/
│   └── schema.prisma          # Data model (User, Network, IpAddress, AuditLog)
├── middleware.ts              # Route guard (placeholder)
├── .env.example
├── vercel.json
├── tailwind.config.ts
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc.json
└── package.json
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your Supabase project values:

```bash
cp .env.example .env.local
```

| Variable                        | Description                              |
| ------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key               |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service role key (server only)  |
| `DATABASE_URL`                 | Postgres connection string (pooled)      |
| `DIRECT_URL`                   | Postgres direct connection (migrations)   |

### 3. Database setup

Generate the Prisma client and apply migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4. Run the dev server

```bash
npm run dev
```

The app is available at `http://localhost:3000`.

## Scripts

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start the development server         |
| `npm run build`      | Production build                     |
| `npm run start`      | Start the production server          |
| `npm run lint`       | Run ESLint                           |
| `npm run typecheck`  | TypeScript type checking             |
| `npm run format`     | Format with Prettier                 |
| `npm run format:check` | Check formatting without writing    |
| `npm run prisma:generate` | Generate Prisma client           |
| `npm run prisma:migrate`  | Create & apply a migration        |
| `npm run prisma:studio`   | Open Prisma Studio               |

## Data Model

The Prisma schema defines four core entities:

- **User** — application user with a role (Admin / Operator / Viewer)
- **Network** — a subnet identified by CIDR notation
- **IpAddress** — an individual IP within a network, with a status
- **AuditLog** — append-only record of changes

See `prisma/schema.prisma` for the full definition.

## Deployment

This project is configured for Vercel out of the box.

1. Push the repository to GitHub/GitLab/Bitbucket.
2. Import the project in Vercel.
3. Add the environment variables from `.env.example` in the Vercel dashboard.
4. Deploy. The `postinstall` hook runs `prisma generate` automatically.

## Notes

- This is a **foundation scaffold**. Pages render placeholder/empty states and
  no data is fetched or mutated yet.
- Supabase Auth helpers are wired in (`lib/supabase/*`) but session enforcement
  in middleware is a placeholder awaiting business logic.
- The Prisma schema is defined but no migrations have been applied.
