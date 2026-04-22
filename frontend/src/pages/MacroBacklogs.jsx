import React, { useState, useEffect, useContext, useRef } from 'react';
import api from '../api';
import { UserContext } from '../App';

export default function MacroBacklogs() {
  const currentUser = useContext(UserContext);
  const isAdmin = currentUser?.role === 'admin';

  const [diretorias, setDiretorias] = useState([]);
  const [selectedDiretoriaId, setSelectedDiretoriaId] = useState('');
  const [macrosNaDiretoria, setMacrosNaDiretoria] = useState([]);
  const [todosOsMacros, setTodosOsMacros] = useState([]);

  const [novoNome, setNovoNome] = useState('');
  const [macroParaAdicionar, setMacroParaAdicionar] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Estado de edição inline: { id, nome }
  const [editando, setEditando] = useState(null);
  const editInputRef = useRef(null);

  useEffect(() => {
    if (isAdmin) {
      api.get('/diretorias').then(r => {
        setDiretorias(r.data);
        if (r.data.length > 0) setSelectedDiretoriaId(String(r.data[0].id));
      }).catch(console.error);
    } else {
      const id = currentUser?.diretoria_id;
      if (id) {
        setDiretorias([{ id, nome: currentUser.diretoria_nome }]);
        setSelectedDiretoriaId(String(id));
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (!selectedDiretoriaId) return;
    api.get(`/diretorias/${selectedDiretoriaId}/macro-backlogs`)
      .then(r => setMacrosNaDiretoria(r.data))
      .catch(console.error);
  }, [selectedDiretoriaId]);

  useEffect(() => {
    api.get('/macro-backlogs').then(r => setTodosOsMacros(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (editando) editInputRef.current?.focus();
  }, [editando]);

  const macrosDisponiveis = todosOsMacros.filter(
    m => !macrosNaDiretoria.some(mn => mn.id === m.id)
  );

  const handleAdicionarExistente = async () => {
    if (!macroParaAdicionar || !selectedDiretoriaId) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/diretorias/${selectedDiretoriaId}/macro-backlogs`, {
        macro_backlog_id: macroParaAdicionar,
      });
      const r = await api.get(`/diretorias/${selectedDiretoriaId}/macro-backlogs`);
      setMacrosNaDiretoria(r.data);
      setMacroParaAdicionar('');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao adicionar macro backlog.');
    } finally {
      setSaving(false);
    }
  };

  const handleCriarENovo = async () => {
    if (!novoNome.trim() || !selectedDiretoriaId) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/macro-backlogs', { nome: novoNome.trim() });
      await api.post(`/diretorias/${selectedDiretoriaId}/macro-backlogs`, {
        macro_backlog_id: res.data.id,
      });
      const [macrosRes, todosRes] = await Promise.all([
        api.get(`/diretorias/${selectedDiretoriaId}/macro-backlogs`),
        api.get('/macro-backlogs'),
      ]);
      setMacrosNaDiretoria(macrosRes.data);
      setTodosOsMacros(todosRes.data);
      setNovoNome('');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar macro backlog.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemover = async (macroId) => {
    setSaving(true);
    setError('');
    try {
      await api.delete(`/diretorias/${selectedDiretoriaId}/macro-backlogs/${macroId}`);
      setMacrosNaDiretoria(prev => prev.filter(m => m.id !== macroId));
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao remover macro backlog.');
    } finally {
      setSaving(false);
    }
  };

  const handleSalvarEdicao = async () => {
    if (!editando || !editando.nome.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/macro-backlogs/${editando.id}`, { nome: editando.nome.trim() });
      const atualizaNome = prev =>
        prev.map(m => m.id === editando.id ? { ...m, nome: editando.nome.trim() } : m);
      setMacrosNaDiretoria(atualizaNome);
      setTodosOsMacros(atualizaNome);
      setEditando(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao renomear macro backlog.');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDownEdicao = (e) => {
    if (e.key === 'Enter') handleSalvarEdicao();
    if (e.key === 'Escape') setEditando(null);
  };

  const diretoriaNome = diretorias.find(d => String(d.id) === String(selectedDiretoriaId))?.nome || '';

  return (
    <div className="nova-demanda-container">
      <div className="form-card">
        <h2 className="form-title">Macro Backlogs</h2>

        {error && <div className="form-error">{error}</div>}

        <div className="form-group">
          <label>Diretoria</label>
          {isAdmin ? (
            <select
              value={selectedDiretoriaId}
              onChange={e => { setSelectedDiretoriaId(e.target.value); setEditando(null); }}
            >
              <option value="">Selecione uma diretoria...</option>
              {diretorias.map(d => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          ) : (
            <div className="readonly-field">{diretoriaNome || '—'}</div>
          )}
        </div>

        {selectedDiretoriaId && (
          <>
            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Macro Backlogs desta Diretoria</label>
              {macrosNaDiretoria.length === 0 ? (
                <p className="empty-hint">Nenhum macro backlog vinculado.</p>
              ) : (
                <ul className="macro-list">
                  {macrosNaDiretoria.map(m => (
                    <li key={m.id} className="macro-list-item">
                      {editando?.id === m.id ? (
                        <>
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editando.nome}
                            onChange={e => setEditando(prev => ({ ...prev, nome: e.target.value }))}
                            onKeyDown={handleKeyDownEdicao}
                            style={{ flex: 1 }}
                          />
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              type="button"
                              className="btn btn-save"
                              style={{ padding: '0.2rem 0.7rem', fontSize: '0.82rem' }}
                              onClick={handleSalvarEdicao}
                              disabled={!editando.nome.trim() || saving}
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.2rem 0.7rem', fontSize: '0.82rem' }}
                              onClick={() => setEditando(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span>{m.nome}</span>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.2rem 0.7rem', fontSize: '0.82rem' }}
                              onClick={() => setEditando({ id: m.id, nome: m.nome })}
                              disabled={saving}
                            >
                              Renomear
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger-sm"
                              onClick={() => handleRemover(m.id)}
                              disabled={saving}
                            >
                              Remover
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Adicionar macro backlog existente</label>
              <div className="input-row">
                <select
                  value={macroParaAdicionar}
                  onChange={e => setMacroParaAdicionar(e.target.value)}
                  disabled={macrosDisponiveis.length === 0}
                >
                  <option value="">
                    {macrosDisponiveis.length === 0
                      ? 'Todos os macros já estão vinculados'
                      : 'Selecione...'}
                  </option>
                  {macrosDisponiveis.map(m => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-save"
                  onClick={handleAdicionarExistente}
                  disabled={!macroParaAdicionar || saving}
                >
                  Adicionar
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Criar novo macro backlog</label>
              <div className="input-row">
                <input
                  type="text"
                  placeholder="Nome do novo macro backlog..."
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCriarENovo()}
                />
                <button
                  type="button"
                  className="btn btn-save"
                  onClick={handleCriarENovo}
                  disabled={!novoNome.trim() || saving}
                >
                  Criar e Adicionar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
