CREATE DATABASE IF NOT EXISTS demandas_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE demandas_db;
SET NAMES utf8mb4;

CREATE TABLE diretorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE coordenadorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    diretoria_id INT,
    FOREIGN KEY (diretoria_id) REFERENCES diretorias(id) ON DELETE SET NULL
);

CREATE TABLE macro_backlogs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL UNIQUE
);

-- Relação muitos-para-muitos entre diretorias e macro_backlogs
CREATE TABLE diretoria_macro_backlogs (
    diretoria_id INT NOT NULL,
    macro_backlog_id INT NOT NULL,
    PRIMARY KEY (diretoria_id, macro_backlog_id),
    FOREIGN KEY (diretoria_id) REFERENCES diretorias(id) ON DELETE CASCADE,
    FOREIGN KEY (macro_backlog_id) REFERENCES macro_backlogs(id) ON DELETE CASCADE
);

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    role ENUM('diretor', 'comum', 'admin') NOT NULL DEFAULT 'comum',
    coordenadoria_id INT,
    FOREIGN KEY (coordenadoria_id) REFERENCES coordenadorias(id) ON DELETE SET NULL
);

CREATE TABLE demandas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    coordenadoria_id INT,
    macro_backlog_id INT NOT NULL,
    prioridade ENUM('crítica', 'alta', 'média', 'baixa') NOT NULL,
    status ENUM('pendente', 'em andamento', 'concluída', 'cancelada', 'suspensa') NOT NULL DEFAULT 'pendente',
    pinned BOOLEAN DEFAULT FALSE,
    pin_order INT DEFAULT 0,
    flag_priorizacao_solicitada BOOLEAN DEFAULT FALSE,
    criador_id INT,
    canal_origem ENUM('SMAX', 'SEI/CPA', 'E-mail', 'Reunião', 'Teams') NULL,
    solicitante VARCHAR(255) NULL,
    setor_demandante VARCHAR(255) NULL,
    responsavel_id INT NULL,
    prazo DATE NULL,
    dominio ENUM('Judicial', 'Administrativo', 'Misto') NULL,
    previsao_entrega DATE NULL,
    justificativa_priorizacao TEXT NULL,
    priorizacao_solicitada_em TIMESTAMP NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    concluded_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (coordenadoria_id) REFERENCES coordenadorias(id) ON DELETE CASCADE,
    FOREIGN KEY (macro_backlog_id) REFERENCES macro_backlogs(id) ON DELETE RESTRICT,
    FOREIGN KEY (criador_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Dependência: uma demanda aguarda resposta/entrega de uma área (coordenadoria)
CREATE TABLE demandas_aguarda_area (
    demanda_id INT,
    coordenadoria_id INT,
    detalhes TEXT,
    PRIMARY KEY (demanda_id, coordenadoria_id),
    FOREIGN KEY (demanda_id) REFERENCES demandas(id) ON DELETE CASCADE,
    FOREIGN KEY (coordenadoria_id) REFERENCES coordenadorias(id) ON DELETE CASCADE
);

CREATE TABLE historico_priorizacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    demanda_id INT,
    diretor_id INT,
    decisao ENUM('aprovado', 'rejeitado') NOT NULL,
    data_decisao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (demanda_id) REFERENCES demandas(id) ON DELETE CASCADE,
    FOREIGN KEY (diretor_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Mock Data
INSERT INTO diretorias (nome) VALUES ('STI 5');

INSERT INTO coordenadorias (nome, diretoria_id) VALUES
    ('STI 5.3', 1),
    ('STI 5.4', 1);

INSERT INTO macro_backlogs (nome) VALUES
    ('Extração'),
    ('Sustentação'),
    ('Painel de BI'),
    ('Codex'),
    ('Ativ Administrativas');

-- STI 5 (diretoria) possui todos os macro backlogs
INSERT INTO diretoria_macro_backlogs (diretoria_id, macro_backlog_id)
SELECT 1, id FROM macro_backlogs;

INSERT INTO usuarios (nome, role, coordenadoria_id) VALUES ('Admin', 'admin', NULL);
INSERT INTO usuarios (nome, role, coordenadoria_id) VALUES ('Jader', 'diretor', 1);
INSERT INTO usuarios (nome, role, coordenadoria_id) VALUES ('Elaine', 'comum', 1);
INSERT INTO usuarios (nome, role, coordenadoria_id) VALUES ('Everton', 'comum', 2);

-- Mock Demands
INSERT INTO demandas (titulo, descricao, coordenadoria_id, macro_backlog_id, prioridade, status, criador_id)
SELECT 'Extração de dados de Marketing', 'Extrair e limpar dados do CRM', 1, id, 'alta', 'em andamento', 2
FROM macro_backlogs WHERE nome = 'Extração';

INSERT INTO demandas (titulo, descricao, coordenadoria_id, macro_backlog_id, prioridade, status, criador_id)
SELECT 'Dashboard Executivo', 'Painel de acompanhamento mensal', 1, id, 'crítica', 'pendente', 2
FROM macro_backlogs WHERE nome = 'Painel de BI';

INSERT INTO demandas (titulo, descricao, coordenadoria_id, macro_backlog_id, prioridade, status, criador_id)
SELECT 'Sustentação Banco X', 'Validar jobs diários no banco X', 2, id, 'média', 'concluída', 3
FROM macro_backlogs WHERE nome = 'Sustentação';

-- Mock: Dashboard Executivo aguarda STI 5.4
INSERT INTO demandas_aguarda_area (demanda_id, coordenadoria_id) VALUES (2, 2);

UPDATE demandas SET concluded_at = created_at WHERE status = 'concluída';
