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

    const [detalhesCol] = await db.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'demandas_aguarda_area' AND COLUMN_NAME = 'detalhes'
    `);
    if (detalhesCol.length === 0) {
        await db.query('ALTER TABLE demandas_aguarda_area ADD COLUMN detalhes TEXT NULL AFTER coordenadoria_id');
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

        // Sem paginação (mock login selector)
        if (!page) {
            const [rows] = await db.query(`${SELECT} ${BASE_QUERY} ORDER BY u.nome`);
            return res.json(rows);
        }

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, parseInt(limit) || 20);
        const offset = (pageNum - 1) * limitNum;
        const like = q ? `%${q}%` : '%';
        const WHERE = q
            ? `WHERE u.nome LIKE ? OR u.email LIKE ? OR u.matricula LIKE ?`
            : '';
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
        const [result] = await db.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
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
                   (SELECT COUNT(*) FROM demandas_aguarda_area daa WHERE daa.demanda_id = d.id) as tem_dependencia,
                   (SELECT GROUP_CONCAT(c2.nome SEPARATOR ', ')
                    FROM demandas_aguarda_area daa2
                    JOIN coordenadorias c2 ON daa2.coordenadoria_id = c2.id
                    WHERE daa2.demanda_id = d.id) as aguarda_areas_nomes
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
        aguarda_areas, prioridade_solicitada,
        canal_origem, solicitante, setor_demandante, responsavel_id, prazo,
        dominio, previsao_entrega, justificativa_priorizacao
    } = req.body;
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

        if (aguarda_areas && aguarda_areas.length > 0) {
            for (const area of aguarda_areas) {
                const areaId = typeof area === 'object' ? area.coordenadoria_id : area;
                const detalhes = typeof area === 'object' ? area.detalhes || null : null;
                await db.query(
                    'INSERT INTO demandas_aguarda_area (demanda_id, coordenadoria_id, detalhes) VALUES (?, ?, ?)',
                    [demandaId, areaId, detalhes]
                );
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
        aguarda_areas, solicitar_priorizacao
    } = req.body;
    const demandaId = req.params.id;
    try {
        await db.query('START TRANSACTION');

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

        if (Array.isArray(aguarda_areas)) {
            await db.query('DELETE FROM demandas_aguarda_area WHERE demanda_id = ?', [demandaId]);
            for (const area of aguarda_areas) {
                const areaId = typeof area === 'object' ? area.coordenadoria_id : area;
                const detalhes = typeof area === 'object' ? area.detalhes || null : null;
                await db.query(
                    'INSERT INTO demandas_aguarda_area (demanda_id, coordenadoria_id, detalhes) VALUES (?, ?, ?)',
                    [demandaId, areaId, detalhes]
                );
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
    try {
        const { status } = req.body;
        const isTerminal = ['concluída', 'cancelada', 'suspensa'].includes(status);
        if (isTerminal) {
            await db.query(
                'UPDATE demandas SET status = ?, concluded_at = COALESCE(concluded_at, NOW()), pinned = false, pin_order = 0 WHERE id = ?',
                [status, req.params.id]
            );
        } else {
            await db.query('UPDATE demandas SET status = ?, concluded_at = NULL WHERE id = ?', [status, req.params.id]);
        }
        res.json({ success: true });
    } catch (err) {
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

        const [dependencias] = await db.query(`
            SELECT daa.demanda_id, daa.coordenadoria_id, daa.detalhes, c.nome as coordenadoria_nome
            FROM demandas_aguarda_area daa
            JOIN coordenadorias c ON daa.coordenadoria_id = c.id
            WHERE daa.demanda_id = ?
            ORDER BY c.nome
        `, [req.params.id]);

        const [historico_priorizacoes] = await db.query(`
            SELECT hp.*, u.nome as diretor_nome
            FROM historico_priorizacoes hp
            LEFT JOIN usuarios u ON hp.diretor_id = u.id
            WHERE hp.demanda_id = ?
            ORDER BY hp.data_decisao DESC
        `, [req.params.id]);

        res.json({ ...demandas[0], dependencias, historico_priorizacoes });
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

        await db.query(
            'INSERT INTO historico_priorizacoes (demanda_id, diretor_id, decisao) VALUES (?, ?, ?)',
            [demandaId, diretor_id, decisao]
        );

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
            SELECT daa.coordenadoria_id, d.id as demanda_id, d.titulo, d.prioridade, d.status, d.pinned,
                   daa.detalhes, c2.nome as area_origem_nome
            FROM demandas_aguarda_area daa
            JOIN demandas d ON daa.demanda_id = d.id AND d.ativo = 1
            LEFT JOIN coordenadorias c2 ON d.coordenadoria_id = c2.id
            ORDER BY daa.coordenadoria_id
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
            SELECT c.id, c.nome, daa.detalhes
            FROM demandas_aguarda_area daa
            JOIN coordenadorias c ON daa.coordenadoria_id = c.id
            WHERE daa.demanda_id = ?
        `, [req.params.id]);
        res.json(rows);
    } catch (err) {
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
