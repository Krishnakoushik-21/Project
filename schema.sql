CREATE DATABASE IF NOT EXISTS startups;
USE startups;

-- Users (Developers, Managers, QA)
CREATE TABLE IF NOT EXISTS developers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role ENUM('manager', 'devops', 'developer', 'qa', 'viewer') NOT NULL,
    team_id INT, -- Future expansion for teams
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sprints
CREATE TABLE IF NOT EXISTS sprints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    goal TEXT,
    status ENUM('planned', 'active', 'completed') DEFAULT 'planned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks (Engineering Work)
CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('todo', 'in_progress', 'review', 'done', 'blocked') DEFAULT 'todo',
    priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    sprint_id INT,
    assignee_id INT,
    points INT DEFAULT 0,
    type ENUM('feature', 'bug', 'debt', 'chore') DEFAULT 'feature',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    -- New columns for Flow metrics
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    deployed_at TIMESTAMP NULL,
    FOREIGN KEY (sprint_id) REFERENCES sprints(id),
    FOREIGN KEY (assignee_id) REFERENCES developers(id)
);

-- Code Velocity: Commits
CREATE TABLE IF NOT EXISTS commits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hash VARCHAR(40) UNIQUE NOT NULL,
    message TEXT,
    author_id INT,
    repo_name VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    FOREIGN KEY (author_id) REFERENCES developers(id)
);

-- Code Velocity: Pull Requests
CREATE TABLE IF NOT EXISTS pull_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    status ENUM('open', 'merged', 'closed') DEFAULT 'open',
    author_id INT,
    repo_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    merged_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    FOREIGN KEY (author_id) REFERENCES developers(id)
);

CREATE TABLE IF NOT EXISTS pr_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pr_id INT NOT NULL,
    reviewer_id INT NOT NULL,
    reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('approved', 'changes_requested', 'commented') DEFAULT 'commented',
    FOREIGN KEY (pr_id) REFERENCES pull_requests(id),
    FOREIGN KEY (reviewer_id) REFERENCES developers(id)
);

-- DevOps: Deployments
CREATE TABLE IF NOT EXISTS deployments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    environment ENUM('production', 'staging', 'dev') NOT NULL,
    status ENUM('success', 'failure', 'pending') DEFAULT 'pending',
    deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INT,
    commit_sha VARCHAR(40),
    FOREIGN KEY (commit_sha) REFERENCES commits(hash) -- Logic link, foreign key optional if data might be missing
);

-- DevOps: Incidents (for MTTR)
CREATE TABLE IF NOT EXISTS incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    description TEXT NOT NULL,
    severity ENUM('minor', 'major', 'critical') NOT NULL,
    status ENUM('open', 'investigating', 'resolved') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL
);

-- Technical Debt
CREATE TABLE IF NOT EXISTS technical_debt (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    related_repo VARCHAR(255),
    estimated_effort_hours INT,
    status ENUM('identified', 'scheduled', 'fixed') DEFAULT 'identified',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fixed_at TIMESTAMP NULL
);

-- CI/CD Pipelines
CREATE TABLE IF NOT EXISTS pipelines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repo_name VARCHAR(255) NOT NULL,
    trigger_event ENUM('push', 'pr', 'schedule', 'manual') NOT NULL,
    status ENUM('success', 'failure', 'running', 'cancelled') NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NULL
);

-- Workflow Stages (Flow Intelligence)
CREATE TABLE IF NOT EXISTS workflow_stages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    stage_name VARCHAR(50) NOT NULL, -- e.g., 'todo', 'in_progress', 'review', 'testing', 'deploying'
    entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    exited_at TIMESTAMP NULL,
    duration_seconds INT GENERATED ALWAYS AS (TIMESTAMPDIFF(SECOND, entered_at, exited_at)) VIRTUAL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_workflow_stages_task_id ON workflow_stages(task_id);
CREATE INDEX idx_workflow_stages_entered_at ON workflow_stages(entered_at);
