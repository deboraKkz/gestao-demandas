import React, { useState, useEffect } from 'react';
import api from '../api';

const ROLES = [
  { value: 'comum',   label: 'Comum' },
  { value: 'diretor', label: 'Diretor' },
  { value: 'admin',   label: 'Admin' },
];
const ROLE_LABEL = { comum: 'Comum', diretor: 'Diretor', admin: 'Admin' };
const LIMIT = 20;
const EMPTY_FORM = { nome: '', email: '', matricula: '', role: 'comum', diretoria_id: '', coordenadoria_id: '' };

function UserForm({ form, setForm, coordenadorias, diretorias, saving, onSubmit, submitLabel, onCancel }) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'diretoria_id') {
      setForm(prev => ({ ...prev, diretoria_id: value, coordenadoria_id: '' }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  return (
    <form onSubmit={onSubmit} className="demanda-form">
      <div className="form-row">
        <div className="form-group">
          <label>Nome *</label>
          <input name="nome" type="text" required placeholder="Nome completo..." value={form.nome} onChange={handleChange} disabled={saving} />
        </div>
        <div className="form-group">
          <label>Matrícula</label>
          <input name="matricula" type="text" placeholder="Nº de matrícula..." value={form.matricula} onChange={handleChange} disabled={saving} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>E-mail</label>
          <input name="email" type="email" placeholder="email@exemplo.com" value={form.email} onChange={handleChange} disabled={saving} />
        </div>
        <div className="form-group">
          <label>Role *</label>
          <select name="role" value={form.role} onChange={handleChange} disabled={saving}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Diretoria</label>
          <select name="diretoria_id" value={form.diretoria_id} onChange={handleChange} disabled={saving}>
            <option value="">Nenhuma</option>
            {diretorias.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Coordenadoria</label>
          <select name="coordenadoria_id" value={form.coordenadoria_id} onChange={handleChange} disabled={saving || !form.diretoria_id}>
            <option value="">{form.diretoria_id ? 'Nenhuma' : 'Selecione a diretoria antes'}</option>
            {coordenadorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      </div>
      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>}
        <button type="submit" className="btn btn-save" disabled={saving || !form.nome.trim()}>
          {saving ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function CadastroUsuarios() {
  const [diretorias, setDiretorias] = useState([]);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createCoords, setCreateCoords] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editCoords, setEditCoords] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refetchKey, setRefetchKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmInativar, setConfirmInativar] = useState(null);

  useEffect(() => {
    api.get('/diretorias').then(r => setDiretorias(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!createForm.diretoria_id) { setCreateCoords([]); return; }
    api.get(`/diretorias/${createForm.diretoria_id}/coordenadorias`).then(r => setCreateCoords(r.data)).catch(console.error);
  }, [createForm.diretoria_id]);

  useEffect(() => {
    if (!editForm.diretoria_id) { setEditCoords([]); return; }
    api.get(`/diretorias/${editForm.diretoria_id}/coordenadorias`).then(r => setEditCoords(r.data)).catch(console.error);
  }, [editForm.diretoria_id]);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (debouncedSearch) params.set('q', debouncedSearch);
    api.get(`/auth/users?${params}`)
      .then(r => { setUsuarios(r.data.data); setTotal(r.data.total); setTotalPages(r.data.totalPages); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedSearch, page, refetchKey]);

  const refetch = () => setRefetchKey(k => k + 1);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/auth/users', {
        nome: createForm.nome.trim(),
        email: createForm.email.trim() || null,
        matricula: createForm.matricula.trim() || null,
        role: createForm.role,
        coordenadoria_id: createForm.coordenadoria_id || null,
      });
      setCreateForm(EMPTY_FORM);
      setPage(1);
      refetch();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cadastrar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u) => {
    setConfirmInativar(null);
    setEditingId(u.id);
    setEditForm({
      nome: u.nome || '',
      email: u.email || '',
      matricula: u.matricula || '',
      role: u.role,
      diretoria_id: u.diretoria_id ? String(u.diretoria_id) : '',
      coordenadoria_id: u.coordenadoria_id ? String(u.coordenadoria_id) : '',
    });
    if (u.diretoria_id) {
      api.get(`/diretorias/${u.diretoria_id}/coordenadorias`).then(r => setEditCoords(r.data)).catch(console.error);
    } else {
      setEditCoords([]);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await api.put(`/auth/users/${editingId}`, {
        nome: editForm.nome.trim(),
        email: editForm.email.trim() || null,
        matricula: editForm.matricula.trim() || null,
        role: editForm.role,
        coordenadoria_id: editForm.coordenadoria_id || null,
      });
      setUsuarios(prev => prev.map(u => u.id === editingId ? res.data : u));
      setEditingId(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const handleInativar = async (id) => {
    setSaving(true); setError('');
    try {
      await api.delete(`/auth/users/${id}`);
      setUsuarios(prev => prev.map(u => u.id === id ? { ...u, ativo: 0 } : u));
      setConfirmInativar(null);
      if (editingId === id) setEditingId(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao inativar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const handleReativar = async (id) => {
    setSaving(true); setError('');
    try {
      await api.patch(`/auth/users/${id}/reativar`);
      setUsuarios(prev => prev.map(u => u.id === id ? { ...u, ativo: 1 } : u));
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao reativar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const COL_SPAN = 5;

  return (
    <div className="nova-demanda-container" style={{ maxWidth: '960px' }}>
      <div className="form-card">
        <h2 className="form-title">Cadastro de Usuários</h2>

        {error && <div className="form-error">{error}</div>}

        <UserForm
          form={createForm}
          setForm={setCreateForm}
          coordenadorias={createCoords}
          diretorias={diretorias}
          saving={saving}
          onSubmit={handleCreate}
          submitLabel="+ Adicionar Usuário"
        />

        <div style={{ marginTop: '2rem' }}>
          <div className="usuarios-list-header">
            <label className="form-section-label" style={{ margin: 0 }}>
              Usuários cadastrados{total > 0 && <span className="usuarios-total"> ({total})</span>}
            </label>
            <input
              type="search"
              className="usuarios-search"
              placeholder="Buscar por nome, e-mail ou matrícula..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
          </div>

          {loading ? (
            <p className="empty-hint" style={{ marginTop: '1rem' }}>Carregando...</p>
          ) : usuarios.length === 0 ? (
            <p className="empty-hint" style={{ marginTop: '1rem' }}>
              {debouncedSearch ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.'}
            </p>
          ) : (
            <>
              <div className="usuarios-table-wrapper">
                <table className="usuarios-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>E-mail</th>
                      <th>Coordenadoria</th>
                      <th>Role</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map(u => (
                      <React.Fragment key={u.id}>
                        <tr className={`usuarios-row${u.ativo === 0 ? ' usuarios-row--inativo' : ''}`}>
                          <td className="usuarios-cell-nome">
                            {u.nome}
                            {u.ativo === 0 && <span className="badge badge-inativo">Inativo</span>}
                          </td>
                          <td className="usuarios-cell-muted">{u.email || '—'}</td>
                          <td className="usuarios-cell-muted">{u.coordenadoria_nome || '—'}</td>
                          <td><span className={`badge badge-role-${u.role}`}>{ROLE_LABEL[u.role]}</span></td>
                          <td>
                            <div className="usuarios-acoes">
                              {editingId !== u.id && (
                                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }} onClick={() => startEdit(u)} disabled={saving}>
                                  Editar
                                </button>
                              )}
                              {u.ativo !== 0 ? (
                                confirmInativar === u.id ? (
                                  <>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>Confirmar?</span>
                                    <button type="button" className="btn btn-danger-sm" onClick={() => handleInativar(u.id)} disabled={saving}>Sim</button>
                                    <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setConfirmInativar(null)}>Não</button>
                                  </>
                                ) : (
                                  <button type="button" className="btn btn-danger-sm" onClick={() => { setConfirmInativar(u.id); setEditingId(null); }} disabled={saving}>
                                    Inativar
                                  </button>
                                )
                              ) : (
                                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }} onClick={() => handleReativar(u.id)} disabled={saving}>
                                  Reativar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {editingId === u.id && (
                          <tr className="usuarios-edit-row">
                            <td colSpan={COL_SPAN}>
                              <UserForm
                                form={editForm}
                                setForm={setEditForm}
                                coordenadorias={editCoords}
                                diretorias={diretorias}
                                saving={saving}
                                onSubmit={handleUpdate}
                                submitLabel="Salvar alterações"
                                onCancel={() => setEditingId(null)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="usuarios-pagination">
                  <button className="btn btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page === 1 || loading}>← Anterior</button>
                  <span className="usuarios-page-info">Página {page} de {totalPages}</span>
                  <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page === totalPages || loading}>Próxima →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
