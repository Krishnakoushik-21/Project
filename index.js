const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const pool = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Test DB Connection
pool.getConnection()
    .then(conn => {
        console.log("✅ Database connected successfully");
        conn.release();
    })
    .catch(err => {
        console.error("❌ Database connection failed:", err);
    });

// ===================================
// AUTH ROUTES
// ===================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    // TODO: implement real password hashing (bcrypt)
    // For this MVP, we will accept any password if the email matches a developer
    // OR we can create a default 'admin' user if the table is empty.

    try {
        // 1. Check if user exists
        const [rows] = await pool.query("SELECT * FROM developers WHERE email = ?", [email]);

        if (rows.length > 0) {
            // User exists - Log them in
            const user = rows[0];
            res.json({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            });
        } else {
            // 2. User does NOT exist - Auto-Register them
            console.log(`New user detected: ${email}. Creating account...`);

            // Derive name from email (e.g. "krishna" from "krishna@gmail.com")
            const name = email.split('@')[0];
            const role = 'developer'; // Default role

            const [result] = await pool.query(
                "INSERT INTO developers (name, email, role) VALUES (?, ?, ?)",
                [name, email, role]
            );

            // Return the new user
            res.json({
                id: result.insertId,
                name: name,
                email: email,
                role: role,
                isNewUser: true
            });
        }
    } catch (err) {
        console.error("Auth error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Middleware (Simple Auth Simulation)
const requireAuth = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ error: "Access Denied: Missing User ID header" });
    }
    req.userId = userId;
    next();
};

// ===================================
// SPRINT ROUTES (ISOLATED)
// ===================================

// GET all sprints (My Workspace Only)
app.get('/api/sprints', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM sprints WHERE user_id = ? ORDER BY start_date DESC', [req.userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET active sprint (My Workspace Only)
app.get('/api/sprints/active', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM sprints WHERE status = 'active' AND user_id = ? LIMIT 1", [req.userId]);
        if (rows.length === 0) return res.status(404).json({ message: 'No active sprint found' });

        const sprint = rows[0];
        const [tasks] = await pool.query("SELECT * FROM tasks WHERE sprint_id = ?", [sprint.id]);

        // Ensure tasks belong to me too (redundant but safe)
        // const [tasks] = await pool.query("SELECT * FROM tasks WHERE sprint_id = ? AND user_id = ?", [sprint.id, req.userId]);

        res.json({ ...sprint, tasks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create sprint (Assign to Me)
app.post('/api/sprints', requireAuth, async (req, res) => {
    const { name, start_date, end_date, goal } = req.body;
    try {
        const [result] = await pool.query(
            "INSERT INTO sprints (name, start_date, end_date, goal, status, user_id) VALUES (?, ?, ?, ?, 'planned', ?)",
            [name, start_date, end_date, goal, req.userId]
        );
        res.json({ id: result.insertId, ...req.body, status: 'planned', user_id: req.userId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create task (Assign to Sprint, Owned by Me)
app.post('/api/sprints/:sprintId/tasks', requireAuth, async (req, res) => {
    const { sprintId } = req.params;
    const { title, type, assignee_id, points } = req.body;
    try {
        // Verify sprint belongs to user
        const [sprintCheck] = await pool.query("SELECT id FROM sprints WHERE id = ? AND user_id = ?", [sprintId, req.userId]);
        if (sprintCheck.length === 0) return res.status(403).json({ error: "Sprint not found or access denied" });

        const [result] = await pool.query(
            "INSERT INTO tasks (title, sprint_id, assignee_id, type, points, status, user_id) VALUES (?, ?, ?, ?, ?, 'todo', ?)",
            [title, sprintId, assignee_id, type, points, req.userId]
        );
        res.json({ id: result.insertId, sprintId, ...req.body });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================
// DORA METRICS ROUTES (ISOLATED)
// ===================================

// GET DORA Metrics (My Workspace Only)
app.get('/api/metrics', requireAuth, async (req, res) => {
    try {
        // Deployment Frequency
        const [deployments] = await pool.query(
            "SELECT COUNT(*) as count FROM deployments WHERE deployed_at >= NOW() - INTERVAL 30 DAY AND status = 'success' AND user_id = ?",
            [req.userId]
        );

        // Lead Time (Filtered by PR Owner)
        const [leadTime] = await pool.query(
            "SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, closed_at)) as hours FROM pull_requests WHERE status = 'merged' AND created_at >= NOW() - INTERVAL 30 DAY AND user_id = ?",
            [req.userId]
        );

        // MTTR (Filtered by Incident Owner)
        const [mttr] = await pool.query(
            "SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)) as hours FROM incidents WHERE status = 'resolved' AND created_at >= NOW() - INTERVAL 30 DAY AND user_id = ?",
            [req.userId]
        );

        // Change Failure Rate
        const [failures] = await pool.query(
            "SELECT (SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) / COUNT(*)) * 100 as rate FROM deployments WHERE deployed_at >= NOW() - INTERVAL 30 DAY AND user_id = ?",
            [req.userId]
        );

        res.json({
            deployment_frequency: deployments[0].count,
            lead_time_hours: leadTime[0].hours || 0,
            mttr_hours: mttr[0].hours || 0,
            change_failure_rate: failures[0].rate || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /deployments (Filtered)
app.post('/api/metrics/deployments', requireAuth, async (req, res) => {
    try {
        const { environment, status, duration_seconds } = req.body;
        const [result] = await pool.query(
            "INSERT INTO deployments (environment, status, duration_seconds, deployed_at, user_id) VALUES (?, ?, ?, NOW(), ?)",
            [environment || 'production', status || 'success', duration_seconds || 300, req.userId]
        );
        res.json({ id: result.insertId, message: 'Deployment recorded' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /incidents (Filtered)
app.post('/api/metrics/incidents', requireAuth, async (req, res) => {
    try {
        const { description, severity, status } = req.body;
        const [result] = await pool.query(
            "INSERT INTO incidents (description, severity, status, user_id) VALUES (?, ?, ?, ?)",
            [description, severity || 'major', status || 'open', req.userId]
        );
        res.json({ id: result.insertId, message: 'Incident reported' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================
// TECHNICAL DEBT ROUTES (ISOLATED)
// ===================================

// GET all debt items (My Workspace Only)
app.get('/api/debt', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM technical_debt WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new debt item
app.post('/api/debt', requireAuth, async (req, res) => {
    const { title, description, priority, related_repo, estimated_effort_hours } = req.body;
    try {
        const [result] = await pool.query(
            "INSERT INTO technical_debt (title, description, priority, related_repo, estimated_effort_hours, status, user_id) VALUES (?, ?, ?, ?, ?, 'identified', ?)",
            [title, description, priority, related_repo, estimated_effort_hours, req.userId]
        );
        res.json({ id: result.insertId, ...req.body, status: 'identified' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT resolve debt (With Ownership Check)
app.put('/api/debt/:id/resolve', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query("UPDATE technical_debt SET status = 'fixed', fixed_at = NOW() WHERE id = ? AND user_id = ?", [id, req.userId]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Item not found or access denied" });
        res.json({ message: 'Debt resolved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================
// PR & CODE REVIEW ANALYTICS ROUTES (ISOLATED)
// ===================================

// 1. PR Volume
app.get('/api/pr/volume', requireAuth, async (req, res) => {
    try {
        const query = `
            SELECT 
                DATE_FORMAT(created_at, '%Y-%u') as week,
                COUNT(*) as count
            FROM pull_requests
            WHERE user_id = ?
            GROUP BY week
            ORDER BY week DESC
            LIMIT 12
        `;
        const [rows] = await pool.query(query, [req.userId]);
        res.json(rows.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Review Time (Avg time to merge)
app.get('/api/pr/review-time', requireAuth, async (req, res) => {
    try {
        // Filter by user_id (Workspace Owner)
        const query = `
            SELECT 
                DATE(created_at) as date,
                AVG(TIMESTAMPDIFF(HOUR, created_at, merged_at)) as avg_hours
            FROM pull_requests
            WHERE status = 'merged' AND merged_at IS NOT NULL AND user_id = ?
            GROUP BY date
            ORDER BY date DESC
            LIMIT 30
        `;
        const [rows] = await pool.query(query, [req.userId]);

        const overallAvg = rows.length > 0
            ? rows.reduce((acc, row) => acc + parseFloat(row.avg_hours), 0) / rows.length
            : 0;

        res.json({ average_hours: overallAvg, trend: rows.reverse() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Aging PRs (Open > 2 days)
app.get('/api/pr/aging', requireAuth, async (req, res) => {
    try {
        const query = `
            SELECT 
                pr.id, pr.title, pr.created_at, d.name as author,
                TIMESTAMPDIFF(DAY, pr.created_at, NOW()) as age_days
            FROM pull_requests pr
            LEFT JOIN developers d ON pr.author_id = d.id
            WHERE pr.status = 'open' AND pr.user_id = ?
            HAVING age_days > 2
            ORDER BY age_days DESC
        `;
        const [rows] = await pool.query(query, [req.userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Review Load per Developer (Filtered workspace)
app.get('/api/pr/review-load', requireAuth, async (req, res) => {
    try {
        // We need to join pr_reviews -> pull_requests to filter by PR workspace owner (user_id)
        const query = `
            SELECT 
                d.name,
                COUNT(r.id) as review_count
            FROM pr_reviews r
            JOIN pull_requests pr ON r.pr_id = pr.id
            JOIN developers d ON r.reviewer_id = d.id
            WHERE r.reviewed_at >= NOW() - INTERVAL 30 DAY AND pr.user_id = ?
            GROUP BY d.id, d.name
            ORDER BY review_count DESC
        `;
        const [rows] = await pool.query(query, [req.userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Merge Rate
app.get('/api/pr/merge-rate', requireAuth, async (req, res) => {
    try {
        const [total] = await pool.query("SELECT COUNT(*) as count FROM pull_requests WHERE user_id = ?", [req.userId]);
        const [merged] = await pool.query("SELECT COUNT(*) as count FROM pull_requests WHERE status = 'merged' AND user_id = ?", [req.userId]);

        const rate = total[0].count > 0 ? (merged[0].count / total[0].count) * 100 : 0;

        res.json({
            rate: rate,
            total: total[0].count,
            merged: merged[0].count
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================
// FLOW INTELLIGENCE ROUTES
// ===================================

// --- 1. LEAD TIME (Creation → Deployment) ---
app.get('/api/flow/lead-time', requireAuth, async (req, res) => {
    try {
        const { sprint_id } = req.query;
        let query = `
            SELECT 
                t.id, t.title, dp.name as assignee,
                TIMESTAMPDIFF(HOUR, t.created_at, t.deployed_at) as lead_time_hours,
                DATE(t.deployed_at) as deploy_date
            FROM tasks t
            LEFT JOIN developers dp ON t.assignee_id = dp.id
            WHERE t.deployed_at IS NOT NULL AND t.user_id = ?
        `;

        const params = [req.userId];
        if (sprint_id) {
            query += ' AND t.sprint_id = ?';
            params.push(sprint_id);
        }

        query += ' ORDER BY t.deployed_at DESC LIMIT 50';

        const [rows] = await pool.query(query, params);

        const avgLeadTime = rows.length > 0
            ? rows.reduce((acc, row) => acc + row.lead_time_hours, 0) / rows.length
            : 0;

        res.json({ average_hours: avgLeadTime, data: rows });
    } catch (error) {
        console.error("Error fetching lead time:", error);
        res.status(500).json({ error: "Failed to fetch lead time metrics" });
    }
});

// --- 2. CYCLE TIME (Start → Completion) ---
app.get('/api/flow/cycle-time', requireAuth, async (req, res) => {
    try {
        const { sprint_id } = req.query;
        let query = `
            SELECT 
                t.id, t.title, dp.name as assignee,
                TIMESTAMPDIFF(HOUR, t.started_at, t.completed_at) as cycle_time_hours,
                DATE(t.completed_at) as completion_date
            FROM tasks t
            LEFT JOIN developers dp ON t.assignee_id = dp.id
            WHERE t.started_at IS NOT NULL AND t.completed_at IS NOT NULL AND t.user_id = ?
        `;

        const params = [req.userId];
        if (sprint_id) {
            query += ' AND t.sprint_id = ?';
            params.push(sprint_id);
        }

        query += ' ORDER BY t.completed_at DESC LIMIT 50';

        const [rows] = await pool.query(query, params);

        const avgCycleTime = rows.length > 0
            ? rows.reduce((acc, row) => acc + row.cycle_time_hours, 0) / rows.length
            : 0;

        res.json({ average_hours: avgCycleTime, data: rows });
    } catch (error) {
        console.error("Error fetching cycle time:", error);
        res.status(500).json({ error: "Failed to fetch cycle time metrics" });
    }
});

// --- 3. THROUGHPUT (Completed tasks per interval) ---
app.get('/api/flow/throughput', requireAuth, async (req, res) => {
    try {
        // Group by week or sprint
        const query = `
            SELECT 
                IFNULL(s.name, 'No Sprint') as period,
                COUNT(t.id) as task_count,
                SUM(t.points) as total_points
            FROM tasks t
            LEFT JOIN sprints s ON t.sprint_id = s.id
            WHERE (t.status = 'done' OR t.completed_at IS NOT NULL) AND t.user_id = ?
            GROUP BY s.id, s.name
            ORDER BY s.end_date DESC
            LIMIT 10
        `;

        const [rows] = await pool.query(query, [req.userId]);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching throughput:", error);
        res.status(500).json({ error: "Failed to fetch throughput metrics" });
    }
});

// --- 4. WORK IN PROGRESS (WIP) ---
app.get('/api/flow/wip', requireAuth, async (req, res) => {
    try {
        const query = `
            SELECT 
                t.status, 
                COUNT(t.id) as count,
                GROUP_CONCAT(dp.name) as developers
            FROM tasks t
            LEFT JOIN developers dp ON t.assignee_id = dp.id
            WHERE t.status NOT IN ('todo', 'done', 'deployed') AND t.user_id = ?
            GROUP BY t.status
        `;

        const [rows] = await pool.query(query, [req.userId]);
        const totalWIP = rows.reduce((acc, row) => acc + row.count, 0);

        res.json({ total: totalWIP, breakdown: rows });
    } catch (error) {
        console.error("Error fetching WIP:", error);
        res.status(500).json({ error: "Failed to fetch WIP metrics" });
    }
});

// --- 5. BOTTLENECKS (Time in Stage) ---
app.get('/api/flow/bottlenecks', async (req, res) => {
    try {
        const query = `
            SELECT 
                stage_name,
                AVG(TIMESTAMPDIFF(HOUR, entered_at, IFNULL(exited_at, NOW()))) as avg_hours_in_stage
            FROM workflow_stages
            GROUP BY stage_name
            ORDER BY avg_hours_in_stage DESC
        `;

        const [rows] = await pool.query(query);

        // Add a "health" indicator
        const analyzed = rows.map(r => ({
            stage: r.stage_name,
            avg_hours: parseFloat(r.avg_hours_in_stage).toFixed(1),
            status: r.avg_hours_in_stage > 24 ? 'Critical' : (r.avg_hours_in_stage > 8 ? 'Warning' : 'Healthy')
        }));

        res.json(analyzed);
    } catch (error) {
        console.error("Error fetching bottlenecks:", error);
        res.status(500).json({ error: "Failed to fetch bottleneck metrics" });
    }
});

app.get('/', (req, res) => {
    res.send('Engineering DevOps Dashboard API Running');
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
