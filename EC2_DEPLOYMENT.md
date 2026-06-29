# Lead Finder — EC2 Deployment & Startup Guide

This document provides step-by-step instructions to deploy and start the **Lead Finder** application on an AWS EC2 instance (Ubuntu/Debian) or any Linux-based VPS.

---

## 🛠️ Stack & Infrastructure Requirements

### 1. Technology Stack
*   **Frontend**: React 18 (Vite, Tailwind CSS, Framer Motion)
*   **Backend**: Node.js & Express (bundled with Esbuild in production)
*   **Database**: PostgreSQL (connected via Drizzle ORM)
*   **Automation/Scraping**: Playwright & Puppeteer (utilizes a headless Chromium browser instance)
*   **AI Models**: Google Gemini API (`GEMINI_API_KEY`) and OpenAI API (`OPENAI_API_KEY`)

### 2. Recommended EC2 Instance Size
> [!IMPORTANT]
> Because this application runs real-time web scraping and email extraction processes using Chromium, headless browser processes are CPU and RAM intensive.
> *   **Minimum**: `t3.medium` (2 vCPUs, 4 GB RAM)
> *   **Recommended**: `t3.large` (2 vCPUs, 8 GB RAM)
> *   Avoid `t2.micro` or `t3.micro` instances as they will likely run out of memory or get CPU-throttled during multi-threaded scraping jobs.

---

## 🚀 Step-by-Step EC2 Deployment Guide

Execute the following commands on your EC2 instance after connecting via SSH.

### Step 1: Update the OS and Install Node.js 20

```bash
# Update local package index
sudo apt-get update && sudo apt-get upgrade -y

# Install curl and build utilities
sudo apt-get install -y curl build-essential

# Add NodeSource repository for Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify installation
node -v  # Should be v20.x.x
npm -v
```

---

### Step 2: Install Chromium System Dependencies
Playwright requires several system libraries to run the Chromium browser in headless mode. The easiest and most reliable way to install them for your specific Ubuntu version is using Playwright's built-in tool.

**Note**: You will run this command in **Step 4** (after cloning the project and running `npm install`), as it requires Playwright to be installed in the project directory first:
```bash
# Installs all required system libraries for Chromium automatically
npx playwright install-deps chromium
```

---

### Step 3: Install PostgreSQL (Or use an external DB like RDS/Neon)
If you wish to host the database on the same EC2 instance, install PostgreSQL locally:

```bash
# Install PostgreSQL server
sudo apt-get install -y postgresql postgresql-contrib

# Start and enable PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Switch to the postgres user to create a database and user
sudo -i -u postgres psql -c "CREATE DATABASE leadfinder;"
sudo -i -u postgres psql -c "CREATE USER leaduser WITH PASSWORD 'SecurePassword123!';"
sudo -i -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE leadfinder TO leaduser;"

# Your DATABASE_URL will be:
# postgresql://leaduser:SecurePassword123!@localhost:5432/leadfinder
```

---

### Step 4: Clone the Project and Install Dependencies

Clone your repository from GitHub onto the EC2 instance, then install the Node modules:

```bash
# Clone the repository
git clone <your-github-repo-url> lead-finder
cd lead-finder

# Install dependencies (ignoring playwright browser download during package install)
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install

# Install Chromium system dependencies dynamically for your OS version
npx playwright install-deps chromium

# Install the Playwright Chromium browser cleanly
npx playwright install chromium
```

---

### Step 5: Configure Environment Variables

Create a `.env` file in the root of the project:

```bash
nano .env
```

Paste the following configurations (replacing placeholders with your actual keys):

```env
# Server Port (Default: 5000)
PORT=5000

# Environment Mode
NODE_ENV=production

# Database Connection (Local PostgreSQL or RDS/Neon/Supabase)
DATABASE_URL=postgresql://leaduser:SecurePassword123!@localhost:5432/leadfinder

# AI Model Credentials
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

Press `Ctrl+O` then `Enter` to save, and `Ctrl+X` to exit nano.

---

### Step 6: Initialize Database Tables and Build the Project

Run the database migrations to create the required tables, then compile the client and server code for production:

```bash
# Run migrations (Safe, runs SQL definitions)
npx tsx script/migrate.ts

# Build the project (Compiles server to dist/index.cjs and client to dist/public)
npm run build
```

---

### Step 7: Install and Configure PM2 (Process Manager)
To run the server in the background and ensure it automatically restarts on crashes or system reboots, use **PM2**:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the application using ecosystem.config.cjs
pm2 start ecosystem.config.cjs

# Make PM2 restart the app on server reboots
pm2 startup
# (Copy and execute the output command from 'pm2 startup' to authorize it)

# Save the current list of PM2 processes
pm2 save
```

#### Useful PM2 Commands:
*   `pm2 status` — Show status of all running processes
*   `pm2 logs lead-finder` — View real-time logs
*   `pm2 restart lead-finder` — Restart the server
*   `pm2 stop lead-finder` — Stop the server

---

### Step 8: Configure Nginx as a Reverse Proxy
To serve the app on standard port 80/443 and allow WebSockets to connect seamlessly:

1.  Install Nginx:
    ```bash
    sudo apt-get install -y nginx
    ```
2.  Edit the default configuration:
    ```bash
    sudo nano /etc/nginx/sites-available/default
    ```
3.  Replace the `location /` block with the following config:
    ```nginx
    server {
        listen 80 default_server;
        listen [::]:80 default_server;

        server_name _;

        # Main proxying rule
        location / {
            proxy_pass http://localhost:5000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
    ```
4.  Restart Nginx:
    ```bash
    sudo nginx -t && sudo systemctl restart nginx
    ```

Now you can access your Lead Finder dashboard by navigating to your EC2 Instance Public DNS/IP address in the browser!
