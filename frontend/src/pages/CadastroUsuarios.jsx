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

// Formulário reutilizável (criação e edição)
function UserForm({ form, setForm, coordenadorias, diretorias, saving, onSubmit, submitLabel, onCancel }) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    // Ao trocar diretoria, limpa coordenadoria
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

  // Estado do formulário de criação
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createCoords, setCreateCoords] = useState([]);

  // Estado do formulário de edição
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editCoords, setEditCoords] = useState([]);

  // Lista / busca / paginação
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
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Dados estáticos
  useEffect(() => {
    api.get('/diretorias').then(r => setDiretorias(r.data)).catch(console.error);
  }, []);

  // Coordenadorias do formulário de criação
  useEffect(() => {
    if (!createForm.diretoria_id) { setCreateCoords([]); return; }
    api.get(`/diretorias/${createForm.diretoria_id}/coordenadorias`).then(r => setCreateCoords(r.data)).catch(console.error);
  }, [createForm.diretoria_id]);

  // Coordenadorias do formulário de edição
  useEffect(() => {
    if (!editForm.diretoria_id) { setEditCoords([]); return; }
    api.get(`/diretorias/${editForm.diretoria_id}/coordenadorias`).then(r => setEditCoords(r.data)).catch(console.error);
  }, [editForm.diretoria_id]);

  // Debounce da busca — reseta página
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch paginado
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (debouncedSearch) params.set('q', debouncedSearch);
    api.get(`/auth/users?${params}`)
      .then(r => {
        setUsuarios(r.data.data);
        setTotal(r.data.total);
        setTotalPages(r.data.totalPages);
      })
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
    setConfirmDelete(null);
    setEditingId(u.id);
    setEditForm({
      nome: u.nome || '',
      email: u.email || '',
      matricula: u.matricula || '',
      role: u.role,
      diretoria_id: u.diretoria_id ? String(u.diretoria_id) : '',
      coordenadoria_id: u.coordenadoria_id ? String(u.coordenadoria_id) : '',
    });
    // O useEffect em [editForm.diretoria_id] cuida de carregar as coordenadorias
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

  const handleDelete = async (id) => {
    setSaving(true); setError('');
    try {
      await api.delete(`/auth/users/${id}`);
      if (editingId === id) setEditingId(null);
      setConfirmDelete(null);
      setTotal(prev => prev - 1);
      // Remove da página atual; se ficou vazia e não é a primeira, volta uma página
      setUsuarios(prev => {
        const next = prev.filter(u => u.id !== id);
        if (next.length === 0 && page > 1) setPage(p => p - 1);
        else refetch();
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir usuário.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nova-demanda-container" style={{ maxWidth: '860px' }}>
      <div className="form-card">
        <h2 className="form-title">Cadastro de Usuários</h2>

        {error && <div className="form-error">{error}</div>}

        {/* Formulário de criação */}
        <UserForm
          form={createForm}
          setForm={setCreateForm}
          coordenadorias={createCoords}
          diretorias={diretorias}
          saving={saving}
          onSubmit={handleCreate}
          submitLabel="+ Adicionar Usuário"
        />

        {/* Cabeçalho da lista */}
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

          {/* Lista */}
          {loading ? (
            <p className="empty-hint" style={{ marginTop: '1rem' }}>Carregando...</p>
          ) : usuarios.length === 0 ? (
            <p className="empty-hint" style={{ marginTop: '1rem' }}>
              {debouncedSearch ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.'}
            </p>
          ) : (
            <>
              <ul className="macro-list" style={{ marginTop: '0.75rem' }}>
                {usuarios.map(u => (
                  <li key={u.id} className={`macro-list-item usuario-item${editingId === u.id ? ' usuario-item--editing' : ''}`}>
                    {editingId === u.id ? (
                      <div style={{ width: '100%' }}>
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
                      </div>
                    ) : (
                      <>
                        <div className="usuario-info">
                          <span className="usuario-nome">{u.nome}</span>
                          <span className="usuario-meta">
                            <span className={`badge badge-role-${u.role}`}>{ROLE_LABEL[u.role]}</span>
                            {u.matricula && <span className="usuario-coord">mat. {u.matricula}</span>}
                            {u.email && <span className="usuario-coord">{u.email}</span>}
                            {u.coordenadoria_nome && <span className="usuario-coord">{u.coordenadoria_nome}</span>}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                          {confirmDelete === u.id ? (
                            <>
                              <span style={{ fontSize: '0.82rem', color: 'var(--danger)', alignSelf: 'center' }}>Confirmar?</span>
                              <button type="button" className="btn btn-danger-sm" onClick={() => handleDelete(u.id)} disabled={saving}>Excluir</button>
                              <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.7rem', fontSize: '0.82rem' }} onClick={() => setConfirmDelete(null)}>Cancelar</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.7rem', fontSize: '0.82rem' }} onClick={() => startEdit(u)} disabled={saving}>Editar</button>
                              <button type="button" className="btn btn-danger-sm" onClick={() => { setConfirmDelete(u.id); setEditingId(null); }} disabled={saving}>Excluir</button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {/* Paginação */}
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
