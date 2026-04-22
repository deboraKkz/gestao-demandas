import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import api from '../api';

const PRIORIDADES = ['crítica', 'alta', 'média', 'baixa'];
const CANAIS_ORIGEM = ['SMAX', 'SEI/CPA', 'E-mail', 'Reunião', 'Teams'];
const DOMINIOS = ['Judicial', 'Administrativo', 'Misto'];

function formatDate(value) {
  if (!value) return 'N/A';
  return format(new Date(value), 'dd/MM/yyyy HH:mm');
}
function formatDateOnly(value) {
  if (!value) return 'N/A';
  return format(new Date(value), 'dd/MM/yyyy');
}
function toDateInput(value) {
  if (!value) return '';
  try { return format(new Date(value), 'yyyy-MM-dd'); } catch { return ''; }
}

function Field({ label, value }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{value || 'N/A'}</strong>
    </div>
  );
}

export default function DemandaDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [demanda, setDemanda] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [coordenadorias, setCoordenadorias] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [macroBacklogs, setMacroBacklogs] = useState([]);

  const loadDemanda = () => {
    setLoading(true);
    api.get(`/demandas/${id}`)
      .then(res => setDemanda(res.data))
      .catch(err => setError(err.response?.data?.error || 'Erro ao carregar detalhes.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDemanda();
    api.get('/coordenadorias').then(r => setCoordenadorias(r.data)).catch(console.error);
    api.get('/auth/users').then(r => setUsuarios(r.data)).catch(console.error);
  }, [id]);

  // Carrega os macro_backlogs disponíveis conforme a coordenadoria selecionada no editForm
  useEffect(() => {
    if (!editMode) return;
    if (!editForm.coordenadoria_id) {
      setMacroBacklogs([]);
      return;
    }
    api
      .get(`/coordenadorias/${editForm.coordenadoria_id}/macro-backlogs`)
      .then(r => {
        setMacroBacklogs(r.data);
        setEditForm(prev => {
          if (prev.macro_backlog_id && !r.data.some(m => String(m.id) === String(prev.macro_backlog_id))) {
            return { ...prev, macro_backlog_id: '' };
          }
          return prev;
        });
      })
      .catch(console.error);
  }, [editMode, editForm.coordenadoria_id]);

  // ── Edit helpers ──────────────────────────────────────────────
  const handleEdit = () => {
    setEditForm({
      titulo: demanda.titulo || '',
      descricao: demanda.descricao || '',
      coordenadoria_id: demanda.coordenadoria_id || '',
      macro_backlog_id: demanda.macro_backlog_id || '',
      prioridade: demanda.prioridade || '',
      canal_origem: demanda.canal_origem || '',
      solicitante: demanda.solicitante || '',
      setor_demandante: demanda.setor_demandante || '',
      responsavel_id: demanda.responsavel_id || '',
      prazo: toDateInput(demanda.prazo),
      dominio: demanda.dominio || '',
      previsao_entrega: toDateInput(demanda.previsao_entrega),
      justificativa_priorizacao: '', // campo para novo pedido — começa em branco
      aguarda_areas: demanda.dependencias?.map(dep => ({
        coordenadoria_id: dep.coordenadoria_id,
        detalhes: dep.detalhes || '',
      })) || [],
      solicitar_priorizacao: false,
    });
    setSaveError('');
    setEditMode(true);
  };

  const handleCancel = () => { setEditMode(false); setSaveError(''); };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleAreaToggle = (coordenadoria_id) => {
    setEditForm(prev => {
      const exists = prev.aguarda_areas.some(a => a.coordenadoria_id === coordenadoria_id);
      return {
        ...prev,
        aguarda_areas: exists
          ? prev.aguarda_areas.filter(a => a.coordenadoria_id !== coordenadoria_id)
          : [...prev.aguarda_areas, { coordenadoria_id, detalhes: '' }],
      };
    });
  };

  const handleAreaDetalhes = (coordenadoria_id, detalhes) => {
    setEditForm(prev => ({
      ...prev,
      aguarda_areas: prev.aguarda_areas.map(a =>
        a.coordenadoria_id === coordenadoria_id ? { ...a, detalhes } : a
      ),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await api.put(`/demandas/${id}`, editForm);
      setEditMode(false);
      loadDemanda();
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Erro ao salvar alterações.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      await api.delete(`/demandas/${id}`);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir demanda.');
    }
  };

  // ── Render ────────────────────────────────────────────────────
  if (loading) return <p>Carregando detalhes...</p>;
  if (error) return <div className="form-error">{error}</div>;
  if (!demanda) return null;

  const priorizacaoPendente = !!demanda.flag_priorizacao_solicitada;
  const ultimaDecisao = demanda.historico_priorizacoes?.[0]?.decisao; // já vem DESC
  const foiAprovada = !priorizacaoPendente && ultimaDecisao === 'aprovado';
  const podesolicitar = !priorizacaoPendente && !foiAprovada;

  return (
    <div className="detail-page">
      {/* ── Cabeçalho ── */}
      <div className={`detail-header area-card-${demanda.coordenadoria_id}`}>
        <div className="detail-header-meta">
          <span className="detail-eyebrow">Demanda #{demanda.id}</span>
          <span className="detail-eyebrow-sep">•</span>
          <span className="detail-eyebrow">{demanda.coordenadoria_nome}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          {editMode ? (
            <input
              name="titulo"
              value={editForm.titulo}
              onChange={handleChange}
              className="edit-input"
              style={{ fontSize: '1.3rem', fontWeight: 700, flex: 1 }}
              required
            />
          ) : (
            <h2 style={{ margin: 0 }}>{demanda.titulo}</h2>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            {editMode ? (
              <>
                <button className="btn btn-secondary" onClick={handleCancel} disabled={saving}>Cancelar</button>
                <button className="btn btn-save" onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : '✓ Salvar'}
                </button>
              </>
            ) : (
              <>
                {deleteConfirm ? (
                  <>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Confirmar exclusão?</span>
                    <button className="btn btn-secondary" onClick={() => setDeleteConfirm(false)}>Não</button>
                    <button className="btn btn-danger" onClick={handleDelete}>Sim, excluir</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-danger-outline" onClick={() => setDeleteConfirm(true)}>Excluir</button>
                    <button className="btn btn-secondary" onClick={handleEdit}>✎ Editar</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="detail-badges" style={{ marginTop: '0.75rem' }}>
          <span className={`badge badge-priority-${demanda.prioridade.toLowerCase().replace('é', 'e')}`}>
            {demanda.prioridade}
          </span>
          <span className={`badge badge-status-${demanda.status.toLowerCase().replace(' ', '-')}`}>
            {demanda.status}
          </span>
        </div>
      </div>

      {saveError && <div className="form-error" style={{ marginTop: '1rem' }}>{saveError}</div>}

      {/* ── Descrição ── */}
      <section className="detail-section">
        <h3>Descrição</h3>
        {editMode ? (
          <textarea name="descricao" rows={4} value={editForm.descricao} onChange={handleChange} className="edit-input" style={{ width: '100%' }} />
        ) : (
          <p className="detail-description">{demanda.descricao || 'Sem descrição.'}</p>
        )}
      </section>

      {/* ── Origem e Contexto ── */}
      <section className="detail-section">
        <h3>Origem e Contexto</h3>
        {editMode ? (
          <div className="detail-edit-grid">
            <div className="detail-edit-field">
              <label>Canal de Origem</label>
              <select name="canal_origem" value={editForm.canal_origem} onChange={handleChange} className="edit-input">
                <option value="">Selecione...</option>
                {CANAIS_ORIGEM.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="detail-edit-field">
              <label>Domínio</label>
              <select name="dominio" value={editForm.dominio} onChange={handleChange} className="edit-input">
                <option value="">Selecione...</option>
                {DOMINIOS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="detail-edit-field">
              <label>Solicitante</label>
              <input name="solicitante" value={editForm.solicitante} onChange={handleChange} className="edit-input" />
            </div>
            <div className="detail-edit-field">
              <label>Setor Demandante</label>
              <input name="setor_demandante" value={editForm.setor_demandante} onChange={handleChange} className="edit-input" />
            </div>
            <div className="detail-edit-field">
              <label>Responsável</label>
              <select name="responsavel_id" value={editForm.responsavel_id} onChange={handleChange} className="edit-input">
                <option value="">Selecione...</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div className="detail-edit-field">
              <label>Prazo</label>
              <input type="date" name="prazo" value={editForm.prazo} onChange={handleChange} className="edit-input" />
            </div>
            <div className="detail-edit-field">
              <label>Previsão de Entrega</label>
              <input type="date" name="previsao_entrega" value={editForm.previsao_entrega} onChange={handleChange} className="edit-input" />
            </div>
          </div>
        ) : (
          <div className="detail-grid">
            <Field label="Canal de Origem" value={demanda.canal_origem} />
            <Field label="Domínio" value={demanda.dominio} />
            <Field label="Solicitante" value={demanda.solicitante} />
            <Field label="Setor Demandante" value={demanda.setor_demandante} />
            <Field label="Responsável" value={demanda.responsavel_nome} />
            <Field label="Prazo" value={formatDateOnly(demanda.prazo)} />
            <Field label="Previsão de Entrega" value={formatDateOnly(demanda.previsao_entrega)} />
          </div>
        )}
      </section>

      {/* ── Dados da Demanda ── */}
      <section className="detail-section">
        <h3>Dados da Demanda</h3>
        {editMode ? (
          <div className="detail-edit-grid">
            <div className="detail-edit-field">
              <label>Coordenadoria</label>
              <select name="coordenadoria_id" value={editForm.coordenadoria_id} onChange={handleChange} className="edit-input">
                <option value="">Selecione...</option>
                {coordenadorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="detail-edit-field">
              <label>Macro Backlog</label>
              <select
                name="macro_backlog_id"
                value={editForm.macro_backlog_id}
                onChange={handleChange}
                className="edit-input"
                disabled={!editForm.coordenadoria_id}
              >
                <option value="">
                  {editForm.coordenadoria_id ? 'Selecione...' : 'Selecione a coordenadoria antes'}
                </option>
                {macroBacklogs.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="detail-edit-field">
              <label>Criticidade</label>
              <select name="prioridade" value={editForm.prioridade} onChange={handleChange} className="edit-input">
                <option value="">Selecione...</option>
                {PRIORIDADES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div className="detail-grid">
            <Field label="ID" value={demanda.id} />
            <Field label="Coordenadoria" value={demanda.coordenadoria_nome} />
            <Field label="Macro Backlog" value={demanda.macro_backlog_nome} />
            <Field label="Criador" value={demanda.criador_nome} />
            <Field label="Fixada" value={demanda.pinned ? 'Sim' : 'Não'} />
            <Field label="Priorização solicitada" value={demanda.flag_priorizacao_solicitada ? 'Sim' : 'Não'} />
            <Field label="Criada em" value={formatDate(demanda.created_at)} />
            <Field label="Concluída em" value={formatDate(demanda.concluded_at)} />
          </div>
        )}
      </section>

      {/* ── Dependências ── */}
      <section className="detail-section">
        <h3>Dependências</h3>
        {editMode ? (
          <div className="dependencias-list" style={{ marginTop: '0.5rem' }}>
            {coordenadorias.map(c => {
              const selected = editForm.aguarda_areas.some(a => a.coordenadoria_id === c.id);
              return (
                <div key={c.id} className="dep-item dep-item-details">
                  <label className="dep-check-row">
                    <input type="checkbox" checked={selected} onChange={() => handleAreaToggle(c.id)} />
                    <span>{c.nome}</span>
                  </label>
                  {selected && (
                    <textarea
                      rows={2}
                      placeholder="Detalhe o que esta dependência precisa resolver..."
                      value={editForm.aguarda_areas.find(a => a.coordenadoria_id === c.id)?.detalhes || ''}
                      onChange={(e) => handleAreaDetalhes(c.id, e.target.value)}
                      className="edit-input"
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          demanda.dependencias?.length ? (
            <div className="detail-dependencies">
              {demanda.dependencias.map(dep => (
                <div key={dep.coordenadoria_id} className={`detail-dependency area-card-${dep.coordenadoria_id}`}>
                  <strong>{dep.coordenadoria_nome}</strong>
                  <p>{dep.detalhes || 'Sem detalhes informados.'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="detail-muted">Sem dependências cadastradas.</p>
          )
        )}
      </section>

      {/* ── Pedido de Priorização ── */}
      <section className="detail-section">
        <h3>Pedido de Priorização</h3>

        {editMode ? (
          <>
            {priorizacaoPendente && (
              <p style={{ color: 'var(--warning)', fontSize: '0.9rem' }}>
                ⏳ Já existe um pedido em análise pelo diretor.
              </p>
            )}

            {foiAprovada && (
              <p style={{ color: 'var(--success)', fontSize: '0.9rem' }}>
                ✓ A priorização desta demanda já foi aprovada.
              </p>
            )}

            {podesolicitar && (
              <>
                <div className="form-group-checkbox">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="solicitar_priorizacao"
                      checked={editForm.solicitar_priorizacao}
                      onChange={handleChange}
                    />
                    <span className="checkbox-text">
                      <strong>Solicitar Priorização ao Diretor</strong>
                    </span>
                  </label>
                </div>
                {editForm.solicitar_priorizacao && (
                  <div className="detail-edit-field" style={{ marginTop: '0.75rem' }}>
                    <label>Justificativa</label>
                    <textarea
                      name="justificativa_priorizacao"
                      rows={3}
                      placeholder="Descreva o motivo pelo qual esta demanda deve ser priorizada..."
                      value={editForm.justificativa_priorizacao}
                      onChange={handleChange}
                      className="edit-input"
                    />
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {priorizacaoPendente ? (
              <>
                <p style={{ color: 'var(--warning)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  ⏳ Pedido em análise pelo diretor.
                </p>
                {demanda.justificativa_priorizacao && (
                  <div className="detail-field detail-field-full">
                    <span>Justificativa</span>
                    <p className="detail-description">{demanda.justificativa_priorizacao}</p>
                  </div>
                )}
              </>
            ) : foiAprovada ? (
              <p style={{ color: 'var(--success)', fontSize: '0.9rem' }}>
                ✓ Priorização aprovada.
              </p>
            ) : (
              <p className="detail-muted">Nenhum pedido ativo.</p>
            )}
          </>
        )}
      </section>

      {/* ── Histórico de Priorização ── */}
      <section className="detail-section">
        <h3>Histórico de Priorização</h3>
        {demanda.historico_priorizacoes?.length ? (
          <div className="detail-history">
            {demanda.historico_priorizacoes.map(item => (
              <div key={item.id} className="detail-history-item">
                <strong>{item.decisao}</strong>
                <span>{item.diretor_nome || 'Diretor N/A'} em {formatDate(item.data_decisao)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="detail-muted">Sem histórico de priorização.</p>
        )}
      </section>
    </div>
  );
}
