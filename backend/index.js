const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const STATUS_CONCLUIDA = 'concluída';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDatabase(maxAttempts = 30) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            await db.query('SELECT 1');
            return;
        } catch (err) {
            if (attempt === maxAttempts) throw err;
            console.log(`Aguardando banco de dados... tentativa ${attempt}/${maxAttempts}`);
            await sleep(2000);
        }
    }
}

async function ensureDatabaseShape() {
    await waitForDatabase();

    const [concludedAtCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'demandas' AND COLUMN_NAME = 'concluded_at'
    `);
    if (concludedAtCol.length === 0) {
        await db.query('ALTER TABLE demandas ADD COLUMN concluded_at TIMESTAMP NULL DEFAULT NULL AFTER created_at');
    }

    // Renomear demandas_aguarda_area → dependencias (idempotente)
    const [daaTable] = await db.query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'demandas_aguarda_area'
    `);
    if (daaTable.length > 0) {
        await db.query('RENAME TABLE demandas_aguarda_area TO dependencias');
    }

    // Garantir que a tabela dependencias existe (instalações frescas)
    await db.query(`
        CREATE TABLE IF NOT EXISTS dependencias (
            demanda_id INT NOT NULL,
            coordenadoria_id INT NOT NULL,
            detalhes TEXT NULL,
            FOREIGN KEY (demanda_id) REFERENCES demandas(id) ON DELETE CASCADE,
            FOREIGN KEY (coordenadoria_id) REFERENCES coordenadorias(id) ON DELETE CASCADE
        )
    `);

    // Adicionar coluna detalhes se ainda não existir (pré-renomeação)
    const [detalhesCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dependencias' AND COLUMN_NAME = 'detalhes'
    `);
    if (detalhesCol.length === 0) {
        await db.query('ALTER TABLE dependencias ADD COLUMN detalhes TEXT NULL AFTER coordenadoria_id');
    }

    // Trocar PK composta por surrogate key id
    // (é necessário dropar as FKs antes de dropar a PK composta no MySQL)
    const [depIdCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dependencias' AND COLUMN_NAME = 'id'
    `);
    if (depIdCol.length === 0) {
        // Descobrir e dropar FKs existentes na tabela
        const [fkRows] = await db.query(`
            SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dependencias'
              AND REFERENCED_TABLE_NAME IS NOT NULL
        `);
        const droppedFks = new Set();
        for (const row of fkRows) {
            if (!droppedFks.has(row.CONSTRAINT_NAME)) {
                await db.query(`ALTER TABLE dependencias DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
                droppedFks.add(row.CONSTRAINT_NAME);
            }
        }
        await db.query(`ALTER TABLE dependencias DROP PRIMARY KEY, ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST`);
        // Recriar FKs
        await db.query(`ALTER TABLE dependencias
            ADD CONSTRAINT fk_dep_demanda      FOREIGN KEY (demanda_id)      REFERENCES demandas(id)       ON DELETE CASCADE,
            ADD CONSTRAINT fk_dep_coordenadoria FOREIGN KEY (coordenadoria_id) REFERENCES coordenadorias(id) ON DELETE CASCADE`);
    }

    // status do ciclo de vida da dependência
    const [depStatusCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dependencias' AND COLUMN_NAME = 'status'
    `);
    if (depStatusCol.length === 0) {
        await db.query(`ALTER TABLE dependencias ADD COLUMN status ENUM('pendente','rejeitada','concluida') NOT NULL DEFAULT 'pendente'`);
    }

    // Data de cadastro da dependência
    const [depCreatedAtCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dependencias' AND COLUMN_NAME = 'created_at'
    `);
    if (depCreatedAtCol.length === 0) {
        await db.query(`ALTER TABLE dependencias ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    }

    const [depResolvidoEmCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dependencias' AND COLUMN_NAME = 'resolvido_em'
    `);
    if (depResolvidoEmCol.length === 0) {
        await db.query(`ALTER TABLE dependencias ADD COLUMN resolvido_em TIMESTAMP NULL`);
    }

    const [depResolvidoPorCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dependencias' AND COLUMN_NAME = 'resolvido_por'
    `);
    if (depResolvidoPorCol.length === 0) {
        await db.query(`ALTER TABLE dependencias ADD COLUMN resolvido_por INT NULL`);
        try { await db.query(`ALTER TABLE dependencias ADD CONSTRAINT fk_dep_resolvido_por FOREIGN KEY (resolvido_por) REFERENCES usuarios(id) ON DELETE SET NULL`); } catch (_) {}
    }

    const [depFilhaIdCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dependencias' AND COLUMN_NAME = 'demanda_filha_id'
    `);
    if (depFilhaIdCol.length === 0) {
        await db.query(`ALTER TABLE dependencias ADD COLUMN demanda_filha_id INT NULL`);
        try { await db.query(`ALTER TABLE dependencias ADD CONSTRAINT fk_dep_filha FOREIGN KEY (demanda_filha_id) REFERENCES demandas(id) ON DELETE SET NULL`); } catch (_) {}
    }


    const [canalOrigemCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'demandas' AND COLUMN_NAME = 'canal_origem'
    `);
    if (canalOrigemCol.length === 0) {
        await db.query(`ALTER TABLE demandas
            ADD COLUMN canal_origem ENUM('SMAX', 'SEI/CPA', 'E-mail', 'Reunião', 'Teams') NULL AFTER flag_priorizacao_solicitada,
            ADD COLUMN solicitante VARCHAR(255) NULL AFTER canal_origem,
            ADD COLUMN setor_demandante VARCHAR(255) NULL AFTER solicitante,
            ADD COLUMN responsavel_id INT NULL AFTER setor_demandante,
            ADD COLUMN prazo DATE NULL AFTER responsavel_id,
            ADD COLUMN dominio ENUM('Judicial', 'Administrativo', 'Misto') NULL AFTER prazo,
            ADD COLUMN previsao_entrega DATE NULL AFTER dominio,
            ADD COLUMN justificativa_priorizacao TEXT NULL AFTER previsao_entrega
        `);
        await db.query(`ALTER TABLE demandas ADD CONSTRAINT fk_responsavel FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL`);
    }

    const [prioSolicitadaCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'demandas' AND COLUMN_NAME = 'priorizacao_solicitada_em'
    `);
    if (prioSolicitadaCol.length === 0) {
        await db.query(`ALTER TABLE demandas ADD COLUMN priorizacao_solicitada_em TIMESTAMP NULL AFTER justificativa_priorizacao`);
    }

    const [ativoCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'demandas' AND COLUMN_NAME = 'ativo'
    `);
    if (ativoCol.length === 0) {
        await db.query(`ALTER TABLE demandas ADD COLUMN ativo BOOLEAN DEFAULT TRUE AFTER priorizacao_solicitada_em`);
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS macro_backlogs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(255) NOT NULL UNIQUE
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS diretorias (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(255) NOT NULL UNIQUE
        )
    `);

    const [diretoriaIdCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coordenadorias' AND COLUMN_NAME = 'diretoria_id'
    `);
    if (diretoriaIdCol.length === 0) {
        await db.query(`ALTER TABLE coordenadorias ADD COLUMN diretoria_id INT NULL`);
        try {
            await db.query(`ALTER TABLE coordenadorias ADD CONSTRAINT fk_coord_diretoria FOREIGN KEY (diretoria_id) REFERENCES diretorias(id) ON DELETE SET NULL`);
        } catch (_) {}
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS diretoria_macro_backlogs (
            diretoria_id INT NOT NULL,
            macro_backlog_id INT NOT NULL,
            PRIMARY KEY (diretoria_id, macro_backlog_id),
            FOREIGN KEY (diretoria_id) REFERENCES diretorias(id) ON DELETE CASCADE,
            FOREIGN KEY (macro_backlog_id) REFERENCES macro_backlogs(id) ON DELETE CASCADE
        )
    `);

    const [macroCountRows] = await db.query('SELECT COUNT(*) AS total FROM macro_backlogs');
    if (macroCountRows[0].total === 0) {
        await db.query(`
            INSERT INTO macro_backlogs (nome) VALUES
                ('Extração'), ('Sustentação'), ('Painel de BI'), ('Codex'), ('Ativ Administrativas')
        `);
    }

    // Garantir que o ENUM role inclua 'admin'
    const [roleColInfo] = await db.query(`
        SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'role'
    `);
    if (roleColInfo.length > 0 && !roleColInfo[0].COLUMN_TYPE.includes('admin')) {
        await db.query(`ALTER TABLE usuarios MODIFY COLUMN role ENUM('diretor', 'comum', 'admin') NOT NULL DEFAULT 'comum'`);
    }

    // Se não há nenhuma diretoria, cria uma padrão e associa tudo a ela
    const [diretoriaCount] = await db.query('SELECT COUNT(*) AS total FROM diretorias');
    if (diretoriaCount[0].total === 0) {
        const [dirResult] = await db.query(`INSERT INTO diretorias (nome) VALUES ('Diretoria Padrão')`);
        const diretoriaId = dirResult.insertId;
        await db.query(`UPDATE coordenadorias SET diretoria_id = ? WHERE diretoria_id IS NULL`, [diretoriaId]);
        await db.query(`
            INSERT INTO diretoria_macro_backlogs (diretoria_id, macro_backlog_id)
            SELECT ?, id FROM macro_backlogs
        `, [diretoriaId]);
    }

    await db.query(
        "UPDATE demandas SET concluded_at = COALESCE(concluded_at, created_at), pinned = false, pin_order = 0 WHERE status IN ('concluída', 'cancelada', 'suspensa')"
    );

    const [usuariosAtivoCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'ativo'
    `);
    if (usuariosAtivoCol.length === 0) {
        await db.query(`ALTER TABLE usuarios ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT TRUE`);
    }

    const [emailCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'email'
    `);
    if (emailCol.length === 0) {
        await db.query(`ALTER TABLE usuarios ADD COLUMN email VARCHAR(255) NULL AFTER nome`);
    }

    const [matriculaCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'matricula'
    `);
    if (matriculaCol.length === 0) {
        await db.query(`ALTER TABLE usuarios ADD COLUMN matricula VARCHAR(50) NULL AFTER email`);
    }

    // Criar tabela de histórico de eventos
    await db.query(`
        CREATE TABLE IF NOT EXISTS historico_eventos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            demanda_id INT NOT NULL,
            tipo ENUM(
                'criada','status_alterado','coordenadoria_alterada',
                'priorizacao_aprovada','priorizacao_rejeitada',
                'dependencia_cadastrada','dependencia_rejeitada','dependencia_concluida'
            ) NOT NULL,
            usuario_id INT NULL,
            payload JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (demanda_id) REFERENCES demandas(id) ON DELETE CASCADE,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
            INDEX idx_hist_demanda_data (demanda_id, created_at)
        )
    `);

    // Migrar historico_priorizacoes → historico_eventos e dropar tabela antiga
    const [histPrioTable] = await db.query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historico_priorizacoes'
    `);
    if (histPrioTable.length > 0) {
        await db.query(`
            INSERT INTO historico_eventos (demanda_id, tipo, usuario_id, payload, created_at)
            SELECT demanda_id,
                   CASE decisao WHEN 'aprovado' THEN 'priorizacao_aprovada' ELSE 'priorizacao_rejeitada' END,
                   diretor_id, NULL, data_decisao
            FROM historico_priorizacoes
        `);
        await db.query('DROP TABLE historico_priorizacoes');
    }

    // Backfill evento 'criada' para demandas sem nenhum evento desse tipo
    await db.query(`
        INSERT INTO historico_eventos (demanda_id, tipo, usuario_id, created_at)
        SELECT d.id, 'criada', d.criador_id, d.created_at
        FROM demandas d
        WHERE NOT EXISTS (
            SELECT 1 FROM historico_eventos he
            WHERE he.demanda_id = d.id AND he.tipo = 'criada'
        )
    `);
}

async function registrarEvento(conn, { demanda_id, tipo, usuario_id = null, payload = null }) {
    await conn.query(
        'INSERT INTO historico_eventos (demanda_id, tipo, usuario_id, payload) VALUES (?, ?, ?, ?)',
        [demanda_id, tipo, usuario_id, payload ? JSON.stringify(payload) : null]
    );
}

// --- AUTH ---
app.get('/api/auth/users', async (req, res) => {
    try {
        const { q, page, limit } = req.query;
        const BASE_QUERY = `
            FROM usuarios u
            LEFT JOIN coordenadorias c ON u.coordenadoria_id = c.id
            LEFT JOIN diretorias d ON c.diretoria_id = d.id
        `;
        const SELECT = `SELECT u.*, c.nome as coordenadoria_nome, d.id as diretoria_id, d.nome as diretoria_nome`;

        // Sem paginação (mock login selector — retorna apenas ativos)
        if (!page) {
            const [rows] = await db.query(`${SELECT} ${BASE_QUERY} WHERE u.ativo = 1 ORDER BY u.nome`);
            return res.json(rows);
        }

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, parseInt(limit) || 20);
        const offset = (pageNum - 1) * limitNum;
        const like = q ? `%${q}%` : '%';
        const WHERE = q
            ? `WHERE (u.nome LIKE ? OR u.email LIKE ? OR u.matricula LIKE ?)`
            : `WHERE 1=1`;
        const params = q ? [like, like, like] : [];

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total ${BASE_QUERY} ${WHERE}`, params
        );
        const [rows] = await db.query(
            `${SELECT} ${BASE_QUERY} ${WHERE} ORDER BY u.nome LIMIT ? OFFSET ?`,
            [...params, limitNum, offset]
        );
        res.json({ data: rows, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/auth/users/:id', async (req, res) => {
    const { nome, email, matricula, role, coordenadoria_id } = req.body;
    if (!nome?.trim() || !role) return res.status(400).json({ error: 'Nome e role são obrigatórios.' });
    if (!['diretor', 'comum', 'admin'].includes(role)) return res.status(400).json({ error: 'Role inválida.' });
    try {
        const [result] = await db.query(
            'UPDATE usuarios SET nome=?, email=?, matricula=?, role=?, coordenadoria_id=? WHERE id=?',
            [nome.trim(), email?.trim() || null, matricula?.trim() || null, role, coordenadoria_id || null, req.params.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
        const [rows] = await db.query(`
            SELECT u.*, c.nome as coordenadoria_nome, d.id as diretoria_id, d.nome as diretoria_nome
            FROM usuarios u
            LEFT JOIN coordenadorias c ON u.coordenadoria_id = c.id
            LEFT JOIN diretorias d ON c.diretoria_id = d.id
            WHERE u.id = ?
        `, [req.params.id]);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/users', async (req, res) => {
    const { nome, role, coordenadoria_id, email, matricula } = req.body;
    if (!nome?.trim() || !role) return res.status(400).json({ error: 'Nome e role são obrigatórios.' });
    if (!['diretor', 'comum', 'admin'].includes(role)) return res.status(400).json({ error: 'Role inválida.' });
    try {
        const [result] = await db.query(
            'INSERT INTO usuarios (nome, email, matricula, role, coordenadoria_id) VALUES (?, ?, ?, ?, ?)',
            [nome.trim(), email?.trim() || null, matricula?.trim() || null, role, coordenadoria_id || null]
        );
        const [rows] = await db.query(`
            SELECT u.*, c.nome as coordenadoria_nome, d.id as diretoria_id, d.nome as diretoria_nome
            FROM usuarios u
            LEFT JOIN coordenadorias c ON u.coordenadoria_id = c.id
            LEFT JOIN diretorias d ON c.diretoria_id = d.id
            WHERE u.id = ?
        `, [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/diretorias/:id/coordenadorias', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM coordenadorias WHERE diretoria_id = ? ORDER BY nome',
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/auth/users/:id', async (req, res) => {
    try {
        const [result] = await db.query('UPDATE usuarios SET ativo = 0 WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/auth/users/:id/reativar', async (req, res) => {
    try {
        const [result] = await db.query('UPDATE usuarios SET ativo = 1 WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DIRETORIAS ---
app.get('/api/diretorias', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM diretorias ORDER BY nome');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/diretorias', async (req, res) => {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });
    try {
        const [result] = await db.query('INSERT INTO diretorias (nome) VALUES (?)', [nome]);
        res.status(201).json({ id: result.insertId, nome });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/diretorias/:id/macro-backlogs', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT mb.*
            FROM macro_backlogs mb
            JOIN diretoria_macro_backlogs dmb ON dmb.macro_backlog_id = mb.id
            WHERE dmb.diretoria_id = ?
            ORDER BY mb.nome
        `, [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/diretorias/:id/macro-backlogs', async (req, res) => {
    const { macro_backlog_ids } = req.body;
    if (!Array.isArray(macro_backlog_ids)) {
        return res.status(400).json({ error: 'macro_backlog_ids deve ser um array' });
    }
    try {
        await db.query('START TRANSACTION');
        await db.query('DELETE FROM diretoria_macro_backlogs WHERE diretoria_id = ?', [req.params.id]);
        for (const mbId of macro_backlog_ids) {
            await db.query(
                'INSERT INTO diretoria_macro_backlogs (diretoria_id, macro_backlog_id) VALUES (?, ?)',
                [req.params.id, mbId]
            );
        }
        await db.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/diretorias/:id/macro-backlogs', async (req, res) => {
    const { macro_backlog_id } = req.body;
    if (!macro_backlog_id) return res.status(400).json({ error: 'macro_backlog_id é obrigatório' });
    try {
        await db.query(
            'INSERT IGNORE INTO diretoria_macro_backlogs (diretoria_id, macro_backlog_id) VALUES (?, ?)',
            [req.params.id, macro_backlog_id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/diretorias/:id/macro-backlogs/:macroId', async (req, res) => {
    try {
        await db.query(
            'DELETE FROM diretoria_macro_backlogs WHERE diretoria_id = ? AND macro_backlog_id = ?',
            [req.params.id, req.params.macroId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- COORDENADORIAS ---
app.get('/api/coordenadorias', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT c.*, d.nome as diretoria_nome
            FROM coordenadorias c
            LEFT JOIN diretorias d ON c.diretoria_id = d.id
            ORDER BY c.nome
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Retorna os macro_backlogs disponíveis para uma coordenadoria (herdados da diretoria pai)
app.get('/api/coordenadorias/:id/macro-backlogs', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT mb.*
            FROM macro_backlogs mb
            JOIN diretoria_macro_backlogs dmb ON dmb.macro_backlog_id = mb.id
            JOIN coordenadorias c ON c.diretoria_id = dmb.diretoria_id
            WHERE c.id = ?
            ORDER BY mb.nome
        `, [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- MACRO BACKLOGS ---
app.get('/api/macro-backlogs', async (req, res) => {
    try {
        const { coordenadoria_id } = req.query;
        if (coordenadoria_id) {
            const [rows] = await db.query(`
                SELECT mb.*
                FROM macro_backlogs mb
                JOIN diretoria_macro_backlogs dmb ON dmb.macro_backlog_id = mb.id
                JOIN coordenadorias c ON c.diretoria_id = dmb.diretoria_id
                WHERE c.id = ?
                ORDER BY mb.nome
            `, [coordenadoria_id]);
            return res.json(rows);
        }
        const [rows] = await db.query('SELECT * FROM macro_backlogs ORDER BY nome');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/macro-backlogs', async (req, res) => {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });
    try {
        const [result] = await db.query('INSERT INTO macro_backlogs (nome) VALUES (?)', [nome]);
        res.status(201).json({ id: result.insertId, nome });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/macro-backlogs/:id', async (req, res) => {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });
    try {
        await db.query('UPDATE macro_backlogs SET nome = ? WHERE id = ?', [nome, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DEMANDAS ---
app.get('/api/demandas', async (req, res) => {
    try {
        let query = `
            SELECT d.*, c.nome as coordenadoria_nome, dir.id as diretoria_id, dir.nome as diretoria_nome,
                   u.nome as criador_nome, ur.nome as responsavel_nome, mb.nome as macro_backlog_nome,
                   (SELECT COUNT(*) FROM dependencias daa WHERE daa.demanda_id = d.id AND daa.status = 'pendente') as tem_dependencia,
                   (SELECT GROUP_CONCAT(c2.nome SEPARATOR ', ')
                    FROM dependencias daa2
                    JOIN coordenadorias c2 ON daa2.coordenadoria_id = c2.id
                    WHERE daa2.demanda_id = d.id AND daa2.status = 'pendente') as dependencias_nomes
            FROM demandas d
            LEFT JOIN coordenadorias c ON d.coordenadoria_id = c.id
            LEFT JOIN diretorias dir ON c.diretoria_id = dir.id
            LEFT JOIN macro_backlogs mb ON d.macro_backlog_id = mb.id
            LEFT JOIN usuarios u ON d.criador_id = u.id
            LEFT JOIN usuarios ur ON d.responsavel_id = ur.id
            WHERE d.ativo = 1
        `;
        const params = [];

        if (req.query.coordenadoria_id) { query += ' AND d.coordenadoria_id = ?'; params.push(req.query.coordenadoria_id); }
        if (req.query.macro_backlog_id)  { query += ' AND d.macro_backlog_id = ?';  params.push(req.query.macro_backlog_id); }
        if (req.query.prioridade)        { query += ' AND d.prioridade = ?';         params.push(req.query.prioridade); }
        if (req.query.status)            { query += ' AND d.status = ?';             params.push(req.query.status); }
        if (req.query.responsavel_id)    { query += ' AND d.responsavel_id = ?';     params.push(req.query.responsavel_id); }

        query += ` ORDER BY
            CASE WHEN d.status IN ('concluída', 'cancelada', 'suspensa') THEN 1 ELSE 0 END ASC,
            CASE WHEN d.status IN ('concluída', 'cancelada', 'suspensa') THEN d.concluded_at END DESC,
            d.pinned DESC,
            d.pin_order ASC,
            FIELD(d.prioridade, 'crítica', 'alta', 'média', 'baixa') ASC,
            d.created_at ASC
        `;

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/demandas', async (req, res) => {
    const {
        titulo, descricao, coordenadoria_id, macro_backlog_id, prioridade, status, criador_id,
        prioridade_solicitada,
        canal_origem, solicitante, setor_demandante, responsavel_id, prazo,
        dominio, previsao_entrega, justificativa_priorizacao
    } = req.body;
    const deps = req.body.dependencias || req.body.aguarda_areas;
    try {
        const flag = !!prioridade_solicitada;
        const concludedAt = status === STATUS_CONCLUIDA ? new Date() : null;
        const prioSolicitadaEm = flag ? new Date() : null;
        const [result] = await db.query(
            `INSERT INTO demandas
                (titulo, descricao, coordenadoria_id, macro_backlog_id, prioridade, status, criador_id,
                 flag_priorizacao_solicitada, concluded_at,
                 canal_origem, solicitante, setor_demandante, responsavel_id, prazo,
                 dominio, previsao_entrega, justificativa_priorizacao, priorizacao_solicitada_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                titulo, descricao, coordenadoria_id || null, macro_backlog_id || null, prioridade,
                status || 'pendente', criador_id, flag, concludedAt,
                canal_origem || null, solicitante || null, setor_demandante || null,
                responsavel_id || null, prazo || null,
                dominio || null, previsao_entrega || null, justificativa_priorizacao || null,
                prioSolicitadaEm
            ]
        );
        const demandaId = result.insertId;

        await registrarEvento(db, { demanda_id: demandaId, tipo: 'criada', usuario_id: criador_id || null });

        if (deps && deps.length > 0) {
            const [coordRows] = await db.query('SELECT id, nome FROM coordenadorias');
            const coordMap = Object.fromEntries(coordRows.map(c => [c.id, c.nome]));
            for (const area of deps) {
                const areaId = typeof area === 'object' ? area.coordenadoria_id : area;
                const detalhes = typeof area === 'object' ? area.detalhes || null : null;
                const [ins] = await db.query(
                    'INSERT INTO dependencias (demanda_id, coordenadoria_id, detalhes) VALUES (?, ?, ?)',
                    [demandaId, areaId, detalhes]
                );
                await registrarEvento(db, {
                    demanda_id: demandaId,
                    tipo: 'dependencia_cadastrada',
                    usuario_id: criador_id || null,
                    payload: { dependencia_id: ins.insertId, coordenadoria_id: areaId, coordenadoria_nome: coordMap[areaId] || null }
                });
            }
        }

        res.status(201).json({ id: demandaId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/demandas/reorder', async (req, res) => {
    const { orderItems } = req.body;
    try {
        for (const item of orderItems) {
            await db.query('UPDATE demandas SET pin_order = ? WHERE id = ? AND status <> ?', [item.pin_order, item.id, STATUS_CONCLUIDA]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/demandas/:id', async (req, res) => {
    const {
        titulo, descricao, coordenadoria_id, macro_backlog_id, prioridade,
        canal_origem, solicitante, setor_demandante, responsavel_id,
        prazo, dominio, previsao_entrega, justificativa_priorizacao,
        solicitar_priorizacao, usuario_id
    } = req.body;
    const deps = req.body.dependencias || req.body.aguarda_areas;
    const demandaId = req.params.id;
    try {
        await db.query('START TRANSACTION');

        // Capturar coordenadoria anterior para detectar mudança
        const [[demandaAtual]] = await db.query('SELECT coordenadoria_id FROM demandas WHERE id = ?', [demandaId]);

        await db.query(
            `UPDATE demandas SET
                titulo = ?, descricao = ?, coordenadoria_id = ?, macro_backlog_id = ?, prioridade = ?,
                canal_origem = ?, solicitante = ?, setor_demandante = ?, responsavel_id = ?,
                prazo = ?, dominio = ?, previsao_entrega = ?, justificativa_priorizacao = ?
             WHERE id = ?`,
            [
                titulo, descricao || null, coordenadoria_id || null, macro_backlog_id || null, prioridade,
                canal_origem || null, solicitante || null, setor_demandante || null, responsavel_id || null,
                prazo || null, dominio || null, previsao_entrega || null, justificativa_priorizacao || null,
                demandaId
            ]
        );

        // Evento coordenadoria_alterada
        const novaCoord = coordenadoria_id || null;
        const velhaCoord = demandaAtual?.coordenadoria_id || null;
        if (String(novaCoord) !== String(velhaCoord)) {
            const [[{ de_nome }]] = await db.query('SELECT COALESCE(c.nome, ?) as de_nome FROM (SELECT 1) x LEFT JOIN coordenadorias c ON c.id = ?', ['N/A', velhaCoord]);
            const [[{ para_nome }]] = await db.query('SELECT COALESCE(c.nome, ?) as para_nome FROM (SELECT 1) x LEFT JOIN coordenadorias c ON c.id = ?', ['N/A', novaCoord]);
            await registrarEvento(db, {
                demanda_id: demandaId,
                tipo: 'coordenadoria_alterada',
                usuario_id: usuario_id || null,
                payload: { de_id: velhaCoord, de_nome, para_id: novaCoord, para_nome }
            });
        }

        // Gerenciar dependências pendentes (diff — não toca nas resolvidas)
        if (Array.isArray(deps)) {
            const [coordRows] = await db.query('SELECT id, nome FROM coordenadorias');
            const coordMap = Object.fromEntries(coordRows.map(c => [c.id, c.nome]));

            const [currentPending] = await db.query(
                'SELECT id, coordenadoria_id, detalhes FROM dependencias WHERE demanda_id = ? AND status = ?',
                [demandaId, 'pendente']
            );
            const currentMap = Object.fromEntries(currentPending.map(r => [r.coordenadoria_id, r]));
            const submittedIds = new Set(deps.map(d => typeof d === 'object' ? d.coordenadoria_id : d));

            // Remover pendentes desmarcadas
            for (const row of currentPending) {
                if (!submittedIds.has(row.coordenadoria_id)) {
                    await db.query('DELETE FROM dependencias WHERE id = ?', [row.id]);
                }
            }

            for (const dep of deps) {
                const areaId = typeof dep === 'object' ? dep.coordenadoria_id : dep;
                const detalhes = typeof dep === 'object' ? dep.detalhes || null : null;
                if (!currentMap[areaId]) {
                    // Não recriar se já existe dep resolvida para a mesma coordenadoria
                    const [[resolved]] = await db.query(
                        'SELECT id FROM dependencias WHERE demanda_id = ? AND coordenadoria_id = ? AND status != ?',
                        [demandaId, areaId, 'pendente']
                    );
                    if (!resolved) {
                        const [ins] = await db.query(
                            'INSERT INTO dependencias (demanda_id, coordenadoria_id, detalhes) VALUES (?, ?, ?)',
                            [demandaId, areaId, detalhes]
                        );
                        await registrarEvento(db, {
                            demanda_id: demandaId,
                            tipo: 'dependencia_cadastrada',
                            usuario_id: usuario_id || null,
                            payload: { dependencia_id: ins.insertId, coordenadoria_id: areaId, coordenadoria_nome: coordMap[areaId] || null }
                        });
                    }
                } else {
                    // Atualizar detalhes da pendente existente
                    await db.query('UPDATE dependencias SET detalhes = ? WHERE id = ?', [detalhes, currentMap[areaId].id]);
                }
            }
        }

        if (solicitar_priorizacao) {
            await db.query(
                'UPDATE demandas SET flag_priorizacao_solicitada = true, priorizacao_solicitada_em = NOW() WHERE id = ?',
                [demandaId]
            );
        }

        await db.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/demandas/:id', async (req, res) => {
    try {
        await db.query('UPDATE demandas SET ativo = false WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/demandas/:id/pin', async (req, res) => {
    try {
        const demandaId = req.params.id;
        const [demanda] = await db.query('SELECT pinned, status FROM demandas WHERE id = ?', [demandaId]);
        if (demanda.length === 0) return res.status(404).json({ error: 'Demanda não encontrada' });
        if (demanda[0].status === STATUS_CONCLUIDA) {
            return res.status(400).json({ error: 'Demandas concluídas não podem ser fixadas' });
        }
        const newPinnedStatus = !demanda[0].pinned;
        await db.query('UPDATE demandas SET pinned = ?, pin_order = ? WHERE id = ?', [newPinnedStatus, 0, demandaId]);
        res.json({ success: true, pinned: newPinnedStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/demandas/:id/status', async (req, res) => {
    const demandaId = req.params.id;
    try {
        const { status, usuario_id } = req.body;
        await db.query('START TRANSACTION');

        const [[demandaAtual]] = await db.query('SELECT status FROM demandas WHERE id = ?', [demandaId]);
        const statusAnterior = demandaAtual?.status;

        const isTerminal = ['concluída', 'cancelada', 'suspensa'].includes(status);
        if (isTerminal) {
            await db.query(
                'UPDATE demandas SET status = ?, concluded_at = COALESCE(concluded_at, NOW()), pinned = false, pin_order = 0 WHERE id = ?',
                [status, demandaId]
            );
        } else {
            await db.query('UPDATE demandas SET status = ?, concluded_at = NULL WHERE id = ?', [status, demandaId]);
        }

        if (statusAnterior !== status) {
            await registrarEvento(db, {
                demanda_id: demandaId,
                tipo: 'status_alterado',
                usuario_id: usuario_id || null,
                payload: { de: statusAnterior, para: status }
            });
        }

        // Cascata: se concluída, fechar dependência vinculada na demanda-mãe
        if (status === STATUS_CONCLUIDA) {
            const [depVinculada] = await db.query(
                `SELECT dep.id, dep.demanda_id as mae_id, dep.coordenadoria_id, c.nome as coordenadoria_nome
                 FROM dependencias dep
                 JOIN coordenadorias c ON dep.coordenadoria_id = c.id
                 WHERE dep.demanda_filha_id = ? AND dep.status = 'pendente'`,
                [demandaId]
            );
            for (const dep of depVinculada) {
                await db.query(
                    `UPDATE dependencias SET status = 'concluida', resolvido_em = NOW(), demanda_filha_id = ? WHERE id = ?`,
                    [demandaId, dep.id]
                );
                await registrarEvento(db, {
                    demanda_id: dep.mae_id,
                    tipo: 'dependencia_concluida',
                    usuario_id: usuario_id || null,
                    payload: { dependencia_id: dep.id, coordenadoria_id: dep.coordenadoria_id, coordenadoria_nome: dep.coordenadoria_nome, demanda_filha_id: parseInt(demandaId), via: 'cascade_filha' }
                });
            }
        }

        await db.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/demandas/:id/priorizar', async (req, res) => {
    try {
        await db.query(
            'UPDATE demandas SET flag_priorizacao_solicitada = true, priorizacao_solicitada_em = NOW() WHERE id = ?',
            [req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/demandas/:id', async (req, res) => {
    try {
        const [demandas] = await db.query(`
            SELECT d.*, c.nome as coordenadoria_nome, dir.id as diretoria_id, dir.nome as diretoria_nome,
                   u.nome as criador_nome, ur.nome as responsavel_nome, mb.nome as macro_backlog_nome
            FROM demandas d
            LEFT JOIN coordenadorias c ON d.coordenadoria_id = c.id
            LEFT JOIN diretorias dir ON c.diretoria_id = dir.id
            LEFT JOIN macro_backlogs mb ON d.macro_backlog_id = mb.id
            LEFT JOIN usuarios u ON d.criador_id = u.id
            LEFT JOIN usuarios ur ON d.responsavel_id = ur.id
            WHERE d.id = ?
        `, [req.params.id]);

        if (demandas.length === 0) return res.status(404).json({ error: 'Demanda não encontrada' });

        // Retorna: pendentes + concluídas com demanda filha (rejeitadas e concluídas sem filha são omitidas)
        const [dependencias] = await db.query(`
            SELECT dep.id, dep.demanda_id, dep.coordenadoria_id, dep.detalhes, dep.status,
                   dep.created_at, dep.demanda_filha_id,
                   c.nome as coordenadoria_nome,
                   df.titulo as demanda_filha_titulo, df.status as demanda_filha_status
            FROM dependencias dep
            JOIN coordenadorias c ON dep.coordenadoria_id = c.id
            LEFT JOIN demandas df ON dep.demanda_filha_id = df.id
            WHERE dep.demanda_id = ?
              AND (dep.status = 'pendente' OR (dep.status = 'concluida' AND dep.demanda_filha_id IS NOT NULL))
            ORDER BY c.nome
        `, [req.params.id]);

        const [historico_eventos] = await db.query(`
            SELECT he.*, u.nome as usuario_nome
            FROM historico_eventos he
            LEFT JOIN usuarios u ON he.usuario_id = u.id
            WHERE he.demanda_id = ?
            ORDER BY he.created_at DESC
        `, [req.params.id]);

        res.json({ ...demandas[0], dependencias, historico_eventos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PRIORIZAÇÕES ---
app.get('/api/priorizacoes', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT d.*, c.nome as coordenadoria_nome, dir.id as diretoria_id, dir.nome as diretoria_nome,
                   u.nome as criador_nome, ur.nome as responsavel_nome, mb.nome as macro_backlog_nome
            FROM demandas d
            LEFT JOIN coordenadorias c ON d.coordenadoria_id = c.id
            LEFT JOIN diretorias dir ON c.diretoria_id = dir.id
            LEFT JOIN macro_backlogs mb ON d.macro_backlog_id = mb.id
            LEFT JOIN usuarios u ON d.criador_id = u.id
            LEFT JOIN usuarios ur ON d.responsavel_id = ur.id
            WHERE d.flag_priorizacao_solicitada = true AND d.ativo = 1
            ORDER BY d.created_at ASC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/priorizacoes/:id/decisao', async (req, res) => {
    const demandaId = req.params.id;
    const { diretor_id, decisao } = req.body;
    try {
        await db.query('START TRANSACTION');

        let qs = 'UPDATE demandas SET flag_priorizacao_solicitada = false';
        if (decisao === 'aprovado') {
            qs += ', pinned = CASE WHEN status = ? THEN false ELSE true END';
        }
        qs += ' WHERE id = ?';

        const updateParams = decisao === 'aprovado' ? [STATUS_CONCLUIDA, demandaId] : [demandaId];
        await db.query(qs, updateParams);

        await registrarEvento(db, {
            demanda_id: demandaId,
            tipo: decisao === 'aprovado' ? 'priorizacao_aprovada' : 'priorizacao_rejeitada',
            usuario_id: diretor_id || null
        });

        await db.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// --- DEPENDÊNCIAS ---
app.get('/api/dependencias', async (req, res) => {
    try {
        const [coordenadorias] = await db.query('SELECT * FROM coordenadorias');

        const [vinculos] = await db.query(`
            SELECT dep.id as dependencia_id, dep.coordenadoria_id, dep.detalhes, dep.created_at,
                   d.id as demanda_id, d.titulo, d.prioridade, d.status, d.pinned,
                   c2.nome as area_origem_nome
            FROM dependencias dep
            JOIN demandas d ON dep.demanda_id = d.id AND d.ativo = 1
            LEFT JOIN coordenadorias c2 ON d.coordenadoria_id = c2.id
            WHERE dep.status = 'pendente'
            ORDER BY dep.coordenadoria_id
        `);

        const grouped = coordenadorias
            .map(coord => ({
                coordenadoria_id: coord.id,
                coordenadoria_nome: coord.nome,
                demandas: vinculos.filter(v => v.coordenadoria_id === coord.id)
            }))
            .filter(g => g.demandas.length > 0);

        res.json(grouped);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/demandas/:id/areas', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT c.id, c.nome, dep.detalhes
            FROM dependencias dep
            JOIN coordenadorias c ON dep.coordenadoria_id = c.id
            WHERE dep.demanda_id = ? AND dep.status = 'pendente'
        `, [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Buscar dependência individual (usada pelo modo "filha" em NovaDemanda)
app.get('/api/dependencias/:id', async (req, res) => {
    try {
        const [[dep]] = await db.query(`
            SELECT dep.id, dep.demanda_id, dep.coordenadoria_id, dep.detalhes, dep.status,
                   c.nome as coordenadoria_nome,
                   d.id as mae_id, d.titulo as mae_titulo, d.prioridade as mae_prioridade, d.pinned as mae_pinned
            FROM dependencias dep
            JOIN coordenadorias c ON dep.coordenadoria_id = c.id
            JOIN demandas d ON dep.demanda_id = d.id
            WHERE dep.id = ?
        `, [req.params.id]);
        if (!dep) return res.status(404).json({ error: 'Dependência não encontrada' });
        res.json(dep);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/dependencias/:id/rejeitar', async (req, res) => {
    const depId = req.params.id;
    const { usuario_id } = req.body;
    try {
        const [[dep]] = await db.query(`
            SELECT dep.*, c.nome as coordenadoria_nome
            FROM dependencias dep
            JOIN coordenadorias c ON dep.coordenadoria_id = c.id
            WHERE dep.id = ?
        `, [depId]);
        if (!dep) return res.status(404).json({ error: 'Dependência não encontrada' });
        if (dep.status !== 'pendente') return res.status(409).json({ error: 'Dependência já resolvida' });

        const [[usuario]] = await db.query('SELECT coordenadoria_id, role FROM usuarios WHERE id = ?', [usuario_id]);
        if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
        if (usuario.role !== 'admin' && usuario.coordenadoria_id !== dep.coordenadoria_id) {
            return res.status(403).json({ error: 'Sem permissão: usuário não pertence à coordenadoria dependida' });
        }

        await db.query('START TRANSACTION');
        await db.query(
            `UPDATE dependencias SET status = 'rejeitada', resolvido_em = NOW(), resolvido_por = ? WHERE id = ?`,
            [usuario_id, depId]
        );
        await registrarEvento(db, {
            demanda_id: dep.demanda_id,
            tipo: 'dependencia_rejeitada',
            usuario_id: usuario_id || null,
            payload: { dependencia_id: dep.id, coordenadoria_id: dep.coordenadoria_id, coordenadoria_nome: dep.coordenadoria_nome }
        });
        await db.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/dependencias/:id/concluir', async (req, res) => {
    const depId = req.params.id;
    const { usuario_id } = req.body;
    try {
        const [[dep]] = await db.query(`
            SELECT dep.*, c.nome as coordenadoria_nome
            FROM dependencias dep
            JOIN coordenadorias c ON dep.coordenadoria_id = c.id
            WHERE dep.id = ?
        `, [depId]);
        if (!dep) return res.status(404).json({ error: 'Dependência não encontrada' });
        if (dep.status !== 'pendente') return res.status(409).json({ error: 'Dependência já resolvida' });

        const [[usuario]] = await db.query('SELECT coordenadoria_id, role FROM usuarios WHERE id = ?', [usuario_id]);
        if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
        if (usuario.role !== 'admin' && usuario.coordenadoria_id !== dep.coordenadoria_id) {
            return res.status(403).json({ error: 'Sem permissão: usuário não pertence à coordenadoria dependida' });
        }

        await db.query('START TRANSACTION');
        await db.query(
            `UPDATE dependencias SET status = 'concluida', resolvido_em = NOW(), resolvido_por = ? WHERE id = ?`,
            [usuario_id, depId]
        );
        await registrarEvento(db, {
            demanda_id: dep.demanda_id,
            tipo: 'dependencia_concluida',
            usuario_id: usuario_id || null,
            payload: { dependencia_id: dep.id, coordenadoria_id: dep.coordenadoria_id, coordenadoria_nome: dep.coordenadoria_nome, demanda_filha_id: dep.demanda_filha_id || null }
        });
        await db.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/dependencias/:id/demanda-filha', async (req, res) => {
    const depId = req.params.id;
    const {
        titulo, descricao, canal_origem, solicitante, setor_demandante,
        responsavel_id, prazo, dominio, previsao_entrega, macro_backlog_id, criador_id
    } = req.body;
    try {
        const [[dep]] = await db.query(`
            SELECT dep.*, c.nome as coordenadoria_nome,
                   d.titulo as mae_titulo, d.prioridade as mae_prioridade, d.pinned as mae_pinned
            FROM dependencias dep
            JOIN coordenadorias c ON dep.coordenadoria_id = c.id
            JOIN demandas d ON dep.demanda_id = d.id
            WHERE dep.id = ?
        `, [depId]);
        if (!dep) return res.status(404).json({ error: 'Dependência não encontrada' });
        if (dep.status !== 'pendente') return res.status(409).json({ error: 'Dependência já resolvida' });

        const [[usuario]] = await db.query('SELECT coordenadoria_id, role FROM usuarios WHERE id = ?', [criador_id]);
        if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });
        if (usuario.role !== 'admin' && usuario.coordenadoria_id !== dep.coordenadoria_id) {
            return res.status(403).json({ error: 'Sem permissão: usuário não pertence à coordenadoria dependida' });
        }

        await db.query('START TRANSACTION');

        const [result] = await db.query(
            `INSERT INTO demandas
                (titulo, descricao, coordenadoria_id, macro_backlog_id, prioridade, status, criador_id,
                 pinned, canal_origem, solicitante, setor_demandante, responsavel_id, prazo, dominio, previsao_entrega)
             VALUES (?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                titulo || dep.mae_titulo, descricao || null,
                dep.coordenadoria_id, macro_backlog_id || null,
                dep.mae_prioridade, criador_id,
                dep.mae_pinned ? 1 : 0,
                canal_origem || null, solicitante || null, setor_demandante || null,
                responsavel_id || null, prazo || null, dominio || null, previsao_entrega || null
            ]
        );
        const filhaId = result.insertId;

        await db.query(
            `UPDATE dependencias SET status = 'concluida', demanda_filha_id = ?, resolvido_em = NOW(), resolvido_por = ? WHERE id = ?`,
            [filhaId, criador_id, depId]
        );

        await registrarEvento(db, { demanda_id: filhaId, tipo: 'criada', usuario_id: criador_id || null });

        await registrarEvento(db, {
            demanda_id: dep.demanda_id,
            tipo: 'dependencia_concluida',
            usuario_id: criador_id || null,
            payload: { dependencia_id: dep.id, coordenadoria_id: dep.coordenadoria_id, coordenadoria_nome: dep.coordenadoria_nome, demanda_filha_id: filhaId }
        });

        await db.query('COMMIT');
        res.status(201).json({ demanda_filha_id: filhaId });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
ensureDatabaseShape()
    .then(() => {
        app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
    })
    .catch((err) => {
        console.error('Erro ao preparar banco de dados:', err);
        process.exit(1);
    });
