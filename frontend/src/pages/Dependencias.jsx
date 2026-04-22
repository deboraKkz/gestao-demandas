import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const TRUNCATE_LEN = 90;
function truncate(text) {
  if (!text) return null;
  return text.length > TRUNCATE_LEN ? text.slice(0, TRUNCATE_LEN).trimEnd() + '…' : text;
}

const PRIORIDADE_LABEL = {
  'crítica': { label: 'Crítica', cls: 'badge-priority-crítica' },
  'alta':    { label: 'Alta',    cls: 'badge-priority-alta' },
  'média':   { label: 'Média',   cls: 'badge-priority-media' },
  'baixa':   { label: 'Baixa',   cls: 'badge-priority-baixa' },
};

const STATUS_LABEL = {
  'pendente':     'badge-status-pendente',
  'em andamento': 'badge-status-em-andamento',
  'concluída':    'badge-status-concluída',
  'suspensa':     'badge-status-suspensa',
  'cancelada':    'badge-status-cancelada',
};

export default function Dependencias() {
  const navigate = useNavigate();
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dependencias')
      .then(r => setGrupos(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Carregando...</p>;

  return (
    <div className="dependencias-page">
      <h2 className="dep-page-title">Dependências por Área</h2>
      <p className="dep-page-subtitle">Demandas que aguardam resposta ou entrega de cada coordenadoria.</p>

      {grupos.length === 0 ? (
        <div className="dep-empty">
          <span>🔗</span>
          <p>Nenhuma dependência de área registrada.</p>
          <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>Ao cadastrar uma demanda, marque as áreas das quais ela depende.</p>
        </div>
      ) : (
        <div className="dep-grupos">
          {grupos.map(grupo => (
            <div key={grupo.coordenadoria_id} className="dep-grupo">
              <div className={`dep-grupo-header area-header-${grupo.coordenadoria_id}`}>
                <span className={`area-dot area-dot-${grupo.coordenadoria_id}`}></span>
                <h3>Demandas aguardando <strong>{grupo.coordenadoria_nome}</strong></h3>
                <span className="dep-count">{grupo.demandas.length}</span>
              </div>

              <div className="dep-grupo-list">
                {grupo.demandas.map(d => (
                  <div key={d.demanda_id} className="dep-row">
                    <div className="dep-row-info">
                      <span className="dep-row-titulo">
                        <span className="demand-id-badge">{d.demanda_id}</span> {d.titulo}
                      </span>
                      {d.area_origem_nome && (
                        <span className="dep-row-origem">de: {d.area_origem_nome}</span>
                      )}
                      {d.detalhes && (
                        <span className="dep-row-detalhes" title={d.detalhes}>
                          {truncate(d.detalhes)}
                        </span>
                      )}
                    </div>
                    <div className="dep-row-badges">
                      {d.pinned ? <span className="pin-icon" title="Fixada">📌</span> : null}
                      <span className={`badge ${PRIORIDADE_LABEL[d.prioridade]?.cls}`}>
                        {PRIORIDADE_LABEL[d.prioridade]?.label || d.prioridade}
                      </span>
                      <span className={`badge ${STATUS_LABEL[d.status]}`}>
                        {d.status}
                      </span>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                        onClick={() => navigate(`/demandas/${d.demanda_id}`)}
                      >
                        Detalhes
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
