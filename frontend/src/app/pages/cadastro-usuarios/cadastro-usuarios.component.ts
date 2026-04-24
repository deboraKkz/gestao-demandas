import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: 'admin' | 'diretor' | 'gestor' | 'usuario';
  coordenadoria_id: number;
  coordenadoria_nome: string;
  ativo: boolean;
}

interface Coordenadoria { id: number; nome: string; }

interface PagedResponse {
  data: Usuario[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Component({
  selector: 'app-cadastro-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cadastro-usuarios.component.html'
})
export class CadastroUsuariosComponent implements OnInit {
  private api = inject(ApiService);

  usuarios = signal<Usuario[]>([]);
  coordenadorias = signal<Coordenadoria[]>([]);
  loading = signal(true);
  error = signal('');

  // Pagination
  page = signal(1);
  limit = 10;
  total = signal(0);
  totalPages = signal(1);
  search = signal('');

  // Create form
  showCreate = signal(false);
  creating = signal(false);
  newUser = { nome: '', email: '', role: 'usuario' as any, coordenadoria_id: '' };

  // Edit
  editingId = signal<number | null>(null);
  editForm: Partial<Usuario & { coordenadoria_id: any }> = {};

  readonly ROLES = ['admin', 'diretor', 'gestor', 'usuario'];

  ngOnInit(): void {
    this.api.get<Coordenadoria[]>('/coordenadorias').subscribe({ next: c => this.coordenadorias.set(c) });
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    const params: Record<string, string | number> = {
      page: this.page(),
      limit: this.limit
    };
    if (this.search()) params['q'] = this.search();
    this.api.get<PagedResponse | Usuario[]>('/auth/users', params).subscribe({
      next: (res: any) => {
        if (res && res.data) {
          this.usuarios.set(res.data);
          this.total.set(res.total ?? res.data.length);
          this.totalPages.set(res.totalPages ?? 1);
        } else {
          this.usuarios.set(res as Usuario[]);
          this.total.set((res as Usuario[]).length);
          this.totalPages.set(1);
        }
        this.loading.set(false);
      },
      error: () => { this.error.set('Erro ao carregar usuários.'); this.loading.set(false); }
    });
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
    this.loadUsers();
  }

  prevPage(): void {
    if (this.page() > 1) { this.page.update(p => p - 1); this.loadUsers(); }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.loadUsers(); }
  }

  createUser(): void {
    if (!this.newUser.nome.trim() || !this.newUser.email.trim()) {
      this.error.set('Nome e email são obrigatórios.');
      return;
    }
    this.creating.set(true);
    const body = { ...this.newUser, coordenadoria_id: Number(this.newUser.coordenadoria_id) || undefined };
    this.api.post<Usuario>('/auth/users', body).subscribe({
      next: () => {
        this.newUser = { nome: '', email: '', role: 'usuario', coordenadoria_id: '' };
        this.showCreate.set(false);
        this.creating.set(false);
        this.loadUsers();
      },
      error: (e) => { this.error.set(e?.error?.message ?? 'Erro ao criar usuário.'); this.creating.set(false); }
    });
  }

  startEdit(u: Usuario): void {
    this.editingId.set(u.id);
    this.editForm = { ...u, coordenadoria_id: u.coordenadoria_id };
  }

  saveEdit(u: Usuario): void {
    const body = { ...this.editForm, coordenadoria_id: Number(this.editForm.coordenadoria_id) || undefined };
    this.api.put<Usuario>(`/auth/users/${u.id}`, body).subscribe({
      next: (updated) => {
        this.usuarios.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.editingId.set(null);
      },
      error: (e) => this.error.set(e?.error?.message ?? 'Erro ao editar.')
    });
  }

  cancelEdit(): void { this.editingId.set(null); }

  inactivate(u: Usuario): void {
    if (!confirm(`Inativar usuário "${u.nome}"?`)) return;
    this.api.delete<void>(`/auth/users/${u.id}`).subscribe({
      next: () => this.loadUsers(),
      error: (e) => this.error.set(e?.error?.message ?? 'Erro ao inativar.')
    });
  }

  reactivate(u: Usuario): void {
    this.api.patch<void>(`/auth/users/${u.id}/reativar`, {}).subscribe({
      next: () => this.loadUsers(),
      error: (e) => this.error.set(e?.error?.message ?? 'Erro ao reativar.')
    });
  }

  toggleShowCreate(): void {
    this.showCreate.update(v => !v);
  }

  roleClass(role: string): string {
    if (role === 'admin') return 'badge badge-role-admin';
    if (role === 'diretor') return 'badge badge-role-diretor';
    return 'badge badge-role-comum';
  }
}
