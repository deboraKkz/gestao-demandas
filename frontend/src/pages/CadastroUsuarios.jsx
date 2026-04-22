import React, { useState, useEffect } from 'react';
import api from '../api';

const ROLES = [
  { value: 'comum',   label: 'Comum' },
  { value: 'diretor', label: 'Diretor' },
  { value: 'admin',   label: 'Admin' },
];

const ROLE_LABEL = { comum: 'Comum', diretor: 'Diretor', admin: 'Admin' };

export default function CadastroUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [coordenadorias, setCoordenadorias] = useState([]);
  const [form, setForm] = useState({ nome: '', role: 'comum', coordenadoria_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    api.get('/auth/users').then(r => setUsuarios(r.data)).catch(console.error);
    api.get('/coordenadorias').then(r => setCoordenadorias(r.data)).catch(console.error);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/auth/users', {
        nome: form.nome.trim(),
        role: form.role,
        coordenadoria_id: form.coordenadoria_id || null,
      });
      setUsuarios(prev => [...prev, res.data]);
      setForm({ nome: '', role: 'comum', coordenadoria_id: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cadastrar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setSaving(true);
    setError('');
    try {
      await api.delete(`/auth/users/${id}`);
      setUsuarios(prev => prev.filter(u => u.id !== id));
      setConfirmDelete(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir usuário.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nova-demanda-container">
      <div className="form-card">
        <h2 className="form-title">Cadastro de Usuários</h2>

        {error && <div className="form-error">{error}</div>}

        {/* Formulário de novo usuário */}
        <form onSubmit={handleSubmit} className="demanda-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="u-nome">Nome *</label>
              <input
                id="u-nome"
                name="nome"
                type="text"
                required
                placeholder="Nome completo..."
                value={form.nome}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="u-role">Role *</label>
              <select id="u-role" name="role" value={form.role} onChange={handleChange}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="u-coord">Coordenadoria</label>
              <select id="u-coord" name="coordenadoria_id" value={form.coordenadoria_id} onChange={handleChange}>
                <option value="">Nenhuma</option>
                {coordenadorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-save" disabled={saving || !form.nome.trim()}>
              {saving ? 'Salvando...' : '+ Adicionar Usuário'}
            </button>
          </div>
        </form>

        {/* Lista de usuários */}
        <div style={{ marginTop: '2rem' }}>
          <label className="form-section-label">Usuários cadastrados</label>
          {usuarios.length === 0 ? (
            <p className="empty-hint">Nenhum usuário cadastrado.</p>
          ) : (
            <ul className="macro-list">
              {usuarios.map(u => (
                <li key={u.id} className="macro-list-item">
                  <div className="usuario-info">
                    <span className="usuario-nome">{u.nome}</span>
                    <span className="usuario-meta">
                      <span className={`badge badge-role-${u.role}`}>{ROLE_LABEL[u.role]}</span>
                      {u.coordenadoria_nome && (
                        <span className="usuario-coord">{u.coordenadoria_nome}</span>
                      )}
                    </span>
                  </div>
                  {confirmDelete === u.id ? (
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>Confirmar?</span>
                      <button
                        type="button"
                        className="btn btn-danger-sm"
                        onClick={() => handleDelete(u.id)}
                        disabled={saving}
                      >
                        Excluir
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.2rem 0.7rem', fontSize: '0.82rem' }}
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-danger-sm"
                      onClick={() => setConfirmDelete(u.id)}
                      disabled={saving}
                    >
                      Excluir
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
