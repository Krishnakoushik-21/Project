# Engineering DevOps & Sprint Intelligence Tracker

**A full-stack dashboard to monitor engineering productivity, sprint flow, technical debt, and process bottlenecks.**

---

## 🚀 Quick Start (What to Run)

To run this application, you need **two separate terminal windows**.

### 🔹 Terminal 1: Backend (Server)
This runs the API that connects to your database.
```bash
cd server
npm start
```
*Wait until you see:* `✅ Database connected successfully`

### 🔹 Terminal 2: Frontend (Client)
This runs the React User Interface.
```bash
cd client
npm run dev
```
*Wait until you see:* `Local: http://localhost:5173/`

**👉 Open Browser:** Go to **[http://localhost:5173](http://localhost:5173)**

---

## 🔑 Login Credentials

The application is protected by a login screen.

- **Email:** `krishna@gmail.com` (Your admin account)
- **Password:** *Any password (e.g. 123456)*

---

## 🔄 Complete Project Flow

This architecture connects a React Frontend to a Node.js Backend and a MySQL Database.

### 1. User Authentication Flow
1.  **User Visits Page**: Browser loads `http://localhost:5173`.
2.  **Login Check**: `App.jsx` checks if a user is logged in.
3.  **User Input**: You enter `krishna@gmail.com`.
4.  **API Call**: Frontend sends POST request to `http://localhost:5000/api/auth/login`.
5.  **Success**: Frontend receives user data -> Shows "Login Successful" Popup -> Redirects to Dashboard.

### 2. Dashboard Data Loading Flow
Once logged in, the `App.jsx` component immediately fetches data:
1.  **DORA Metrics**: GET `/api/metrics` (Deployments, Lead Time, MTTR, Failure Rate)
2.  **Sprint Data**: GET `/api/sprints` (Active and past sprints)
3.  **Flow Metrics**: GET `/api/flow/*` (Cycle time, throughput, WIP)
4.  **Technical Debt**: GET `/api/debt` (Reported debt items)

### 3. Flow & Cycle-Time Intelligence (NEW 🚀)
1.  **Lead Time**: Tracks time from task creation to deployment.
2.  **Cycle Time**: Tracks time from task start to completion.
3.  **Throughput**: Measures completed tasks per sprint/period.
4.  **Bottlenecks**: Identifies workflow stages causing delays (e.g., Code Review, QA).
5.  **WIP**: Visualizes active work in progress to prevent overloading.

### 4. Consolidated Architecture
To streamline development and maintenance:
*   **Backend**: All API routes (Auth, Sprints, Metrics, Flow, Debt) are consolidated into a single `server/index.js` file.
*   **Frontend**: All dashboard views and components are consolidated into `client/src/App.jsx`.
*   **Database**: All schema definitions, including new flow tracking tables, are in `database/schema.sql`.

---

## 🛠 Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | React + Vite | The UI you see and interact with. |
| **Styling** | TailwindCSS | Makes the UI look modern and responsive. |
| **Backend** | Node.js + Express | Receives requests and talks to the DB. |
| **Database** | MySQL | Stores sprints, debt, user data, and flow metrics. |

---

## 🗄 Database Updates

The database schema (`database/schema.sql`) has been updated to support:
*   **Task Lifecycle**: `started_at`, `completed_at`, `deployed_at` timestamps.
*   **Workflow Stages**: New table to track time spent in each stage (ToDo, In Progress, Review, etc.).

---

## 🐛 Troubleshooting

| Problem | Solution |
| :--- | :--- |
| **"Network Error"** | Ensure the **Backend (Terminal 1)** is running. |
| **"Database connection failed"** | Check your password in `server/.env`. |
| **"Only @gmail.com allowed"** | Use `krishna@gmail.com` to log in. |
