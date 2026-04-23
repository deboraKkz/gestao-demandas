import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import api from '../api';
import PinIcon from '../components/PinIcon';
import { UserContext } from '../App';

const TRUNCATE_LEN = 90;
function truncate(text) {
  if (!text) return null;
  return text.length > TRUNCATE_LEN ? text.slice(0, TRUNCATE_LEN).trimEnd() + '…' : text;
}

function formatDateShort(value) {
  if (!value) return '';
  try { return format(new Date(value), 'dd/MM/yyyy'); } catch { return ''; }
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
  const currentUser = useContext(UserContext);

  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // dependencia_id em ação
  const [actionError, setActionError] = useState('');

  const carregarDependencias = () => {
    setLoading(true);
    api.get('/dependencias')
      .then(r => setGrupos(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregarDependencias(); }, []);

  const podeAgir = (coordenadoria_id) =>
    currentUser?.role === 'admin' ||
    Number(currentUser?.coordenadoria_id) === Number(coordenadoria_id);

  const handleRejeitar = async (dep) => {
    if (!window.confirm('Confirma a rejeição desta dependência?')) return;
    setActionLoading(dep.dependencia_id);
    setActionError('');
    try {
      await api.post(`/dependencias/${dep.dependencia_id}/rejeitar`, { usuario_id: currentUser.id });
      carregarDependencias();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Erro ao rejeitar dependência.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConcluir = async (dep) => {
    if (!window.confirm('Confirma a conclusão desta dependência sem criar nova demanda?')) return;
    setActionLoading(dep.dependencia_id);
    setActionError('');
    try {
      await api.post(`/dependencias/${dep.dependencia_id}/concluir`, { usuario_id: currentUser.id });
      carregarDependencias();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Erro ao concluir dependência.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCadastrarFilha = (dep) => {
    navigate(`/nova-demanda?dependencia=${dep.dependencia_id}`);
  };

  if (loading) return <p>Carregando...</p>;

  return (
    <div className="dependencias-page">
      <h2 className="dep-page-title">Dependências por Área</h2>
      <p className="dep-page-subtitle">Demandas que aguardam resposta ou entrega de cada coordenadoria.</p>

      {actionError && (
        <div className="form-error" style={{ marginBottom: '1rem' }}>{actionError}</div>
      )}

      {grupos.length === 0 ? (
        <div className="dep-empty">
          <span>🔗</span>
          <p>Nenhuma dependência de área registrada.</p>
          <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>Ao cadastrar uma demanda, marque as áreas das quais ela depende.</p>
        </div>
      ) : (
        <div className="dep-grupos">
          {grupos.map(grupo => {
            const temPermissao = podeAgir(grupo.coordenadoria_id);
            return (
              <div key={grupo.coordenadoria_id} className="dep-grupo">
                <div className={`dep-grupo-header area-header-${grupo.coordenadoria_id}`}>
                  <span className={`area-dot area-dot-${grupo.coordenadoria_id}`}></span>
                  <h3>Demandas aguardando <strong>{grupo.coordenadoria_nome}</strong></h3>
                  <span className="dep-count">{grupo.demandas.length}</span>
                </div>

                <div className="dep-grupo-list">
                  {[...grupo.demandas].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).map(d => {
                    const emAcao = actionLoading === d.dependencia_id;
                    return (
                      <div key={d.dependencia_id} className="dep-card">
                        <div className="dep-card-main">
                          <div className="dep-card-title-row">
                            <div className="dep-card-title-group">
                              {!!d.pinned && <PinIcon size={13} />}
                              <span className="demand-id-badge">{d.demanda_id}</span>
                              <span className="dep-card-titulo">{d.titulo}</span>
                            </div>
                            <div className="dep-card-badges">
                              <span className={`badge ${PRIORIDADE_LABEL[d.prioridade]?.cls}`}>
                                {PRIORIDADE_LABEL[d.prioridade]?.label || d.prioridade}
                              </span>
                              <span className={`badge ${STATUS_LABEL[d.status]}`}>
                                {d.status}
                              </span>
                            </div>
                          </div>
                          <div className="dep-card-meta">
                            {d.area_origem_nome && (
                              <span className="dep-card-meta-item">
                                <span className="dep-card-meta-label">de</span> {d.area_origem_nome}
                              </span>
                            )}
                            {d.created_at && (
                              <span className="dep-card-meta-item">
                                cadastrada em {formatDateShort(d.created_at)}
                              </span>
                            )}
                          </div>
                          {d.detalhes && (
                            <p className="dep-card-detalhes" title={d.detalhes}>
                              {truncate(d.detalhes)}
                            </p>
                          )}
                          {d.demanda_filha_id && (
                            <div
                              className="dep-card-filha"
                              onClick={() => navigate(`/demandas/${d.demanda_filha_id}`)}
                            >
                              <span className={`badge badge-status-${(d.filha_status || '').toLowerCase().replace(' ', '-')}`} style={{ fontSize: '0.69rem' }}>
                                {d.filha_status}
                              </span>
                              <span>Filha #{d.demanda_filha_id} — {d.filha_titulo}</span>
                            </div>
                          )}
                        </div>
                        <div className="dep-card-footer">
                          <button
                            className="dep-btn-link"
                            onClick={() => navigate(`/demandas/${d.demanda_id}`)}
                          >
                            Ver detalhes →
                          </button>
                          {temPermissao && (
                            <div className="dep-card-actions">
                              {!d.demanda_filha_id && (
                                <button
                                  className="dep-action-btn dep-action-filha"
                                  disabled={emAcao}
                                  onClick={() => handleCadastrarFilha(d)}
                                >
                                  + Nova demanda filha
                                </button>
                              )}
                              <button
                                className="dep-action-btn dep-action-concluir"
                                disabled={emAcao}
                                onClick={() => handleConcluir(d)}
                              >
                                Concluir
                              </button>
                              <button
                                className="dep-action-btn dep-action-rejeitar"
                                disabled={emAcao}
                                onClick={() => handleRejeitar(d)}
                              >
                                Rejeitar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
