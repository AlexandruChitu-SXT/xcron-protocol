# XCron Protocol Web Dashboard

This is the Next.js web application for the XCron Protocol, providing an interactive dashboard to monitor keeper metrics, schedule tasks, manage burner keys (Clone-Keys), and view execution telemetry on the MultiversX network.

## Project Structure

* `/src/app`: Page routing, layout structure, and API route definitions.
* `/src/components`: UI components (telemetry views, active feed indicators, radar visualization, price tickers).
* `/src/hooks`: Integration hooks for reading contract queries, tracking transaction state, and managing clone keys.
* `/src/utils`: Helper functions, including quantum encryption wrappers and ABI configurations.

## Getting Started

### Prerequisites

* Node.js 20+
* npm or pnpm package manager

### Configuration

Copy the example environment file and configure the target network API endpoint and contract addresses:

```bash
cp .env.example .env.local
```

### Installation

Install dependencies using the legacy peer dependency flag to accommodate the MultiversX JS SDK requirements:

```bash
npm install --legacy-peer-deps
```

### Local Development

Run the Next.js development server:

```bash
npm run dev
```

Open `http://localhost:3000` to view the application.

### Building for Production

To build the static application bundle:

```bash
npm run build
```

This will run type checking, generate optimization assets, and bundle the output inside the build directory.

## Deployment

Deployments are configured for Netlify and Vercel. The build process uses the `netlify.toml` configuration at the root of the workspace to build this subdirectory and publish the output.
