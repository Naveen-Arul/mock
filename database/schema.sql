-- =============================================================================
-- MockMentorBiz Database Schema
-- MySQL 8.0+ compatible
-- =============================================================================

-- Create database if not exists (usually handled by docker-compose)
CREATE DATABASE IF NOT EXISTS mockmentorbiz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mockmentorbiz;

-- =============================================================================
-- Users table
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role ENUM('student', 'admin', 'super_admin', 'owner') NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    admin_id VARCHAR(100) DEFAULT NULL COMMENT 'For students - their admins unique ID',
    department VARCHAR(100) DEFAULT NULL,
    college_name VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_username (username),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Admins table
-- =============================================================================
CREATE TABLE IF NOT EXISTS admins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    unique_admin_id VARCHAR(100) UNIQUE NOT NULL,
    department VARCHAR(100) NOT NULL,
    permissions JSON DEFAULT NULL,
    created_by INT DEFAULT NULL COMMENT 'Super admin who created this admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_unique_admin_id (unique_admin_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Interviews table
-- =============================================================================
CREATE TABLE IF NOT EXISTS interviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    admin_id INT DEFAULT NULL COMMENT 'For scheduled interviews',
    interview_type ENUM('resume_based', 'domain_based', 'scheduled') NOT NULL,
    domain VARCHAR(100) DEFAULT NULL COMMENT 'For domain-based interviews',
    status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
    scheduled_at TIMESTAMP NULL DEFAULT NULL,
    started_at TIMESTAMP NULL DEFAULT NULL,
    ended_at TIMESTAMP NULL DEFAULT NULL,
    duration_minutes INT DEFAULT 0,
    num_questions INT DEFAULT 10,
    questions JSON DEFAULT NULL,
    responses JSON DEFAULT NULL,
    resume_path VARCHAR(500) DEFAULT NULL,
    overall_score FLOAT DEFAULT 0.0,
    feedback TEXT DEFAULT NULL,
    is_proctored BOOLEAN DEFAULT TRUE,
    admin_notice JSON DEFAULT NULL COMMENT 'Set by admin after malpractice review',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_student_id (student_id),
    INDEX idx_admin_id (admin_id),
    INDEX idx_status (status),
    INDEX idx_interview_type (interview_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Performance Records table
-- =============================================================================
CREATE TABLE IF NOT EXISTS performance_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    interview_id INT NOT NULL,
    communication_score FLOAT DEFAULT 0.0,
    technical_score FLOAT DEFAULT 0.0,
    confidence_score FLOAT DEFAULT 0.0,
    response_time_avg FLOAT DEFAULT 0.0 COMMENT 'Average response time in seconds',
    completion_rate FLOAT DEFAULT 0.0 COMMENT 'Percentage of questions answered',
    strengths JSON DEFAULT NULL,
    weaknesses JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
    INDEX idx_student_id (student_id),
    INDEX idx_interview_id (interview_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Malpractice Records table
-- =============================================================================
CREATE TABLE IF NOT EXISTS malpractice_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    interview_id INT NOT NULL,
    malpractice_type ENUM(
        'multiple_faces',
        'tab_switching',
        'no_face_detected',
        'audio_anomaly',
        'phone_detected',
        'fullscreen_exit',
        'copy_paste',
        'right_click',
        'prohibited_keys',
        'window_blur',
        'look_away',
        'multiple_persons'
    ) NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium' COMMENT 'low, medium, high',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT DEFAULT NULL,
    evidence_data JSON DEFAULT NULL,
    FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
    INDEX idx_interview_id (interview_id),
    INDEX idx_malpractice_type (malpractice_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Domains table
-- =============================================================================
CREATE TABLE IF NOT EXISTS domains (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT DEFAULT NULL,
    question_pool JSON DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- College Profiles table
-- =============================================================================
CREATE TABLE IF NOT EXISTS college_profiles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    super_admin_user_id INT UNIQUE NOT NULL,
    address TEXT DEFAULT NULL,
    contact_phone VARCHAR(50) DEFAULT NULL,
    website_url VARCHAR(500) DEFAULT NULL,
    established_year INT DEFAULT NULL,
    college_type VARCHAR(50) DEFAULT 'engineering',
    status VARCHAR(20) DEFAULT 'active',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (super_admin_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_super_admin_user_id (super_admin_user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Insert default domains
-- =============================================================================
INSERT INTO domains (name, description, is_active) VALUES
    ('Python', 'Python programming language and frameworks', TRUE),
    ('Java', 'Java programming language and frameworks', TRUE),
    ('JavaScript', 'JavaScript, Node.js, and web frameworks', TRUE),
    ('Data Structures', 'Arrays, linked lists, trees, graphs, etc.', TRUE),
    ('Algorithms', 'Sorting, searching, dynamic programming, etc.', TRUE),
    ('Database Management', 'SQL, NoSQL, database design', TRUE),
    ('Web Development', 'HTML, CSS, JavaScript, React, Angular, Vue', TRUE),
    ('Machine Learning', 'ML algorithms, neural networks, AI concepts', TRUE),
    ('Cloud Computing', 'AWS, Azure, GCP, cloud architecture', TRUE),
    ('DevOps', 'CI/CD, Docker, Kubernetes, automation', TRUE),
    ('Mobile Development', 'Android, iOS, React Native, Flutter', TRUE),
    ('Cybersecurity', 'Network security, cryptography, ethical hacking', TRUE),
    ('System Design', 'Scalability, architecture patterns, design principles', TRUE),
    ('Operating Systems', 'Process management, memory, file systems', TRUE),
    ('Networking', 'TCP/IP, HTTP, DNS, network protocols', TRUE)
ON DUPLICATE KEY UPDATE name=name;

-- =============================================================================
-- Schema initialization complete
-- =============================================================================
