import { Injectable, signal } from '@angular/core';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: 'admin' | 'diretor' | 'gestor' | 'usuario';
  coordenadoria_id: number;
  coordenadoria_nome: string;
  ativo: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  currentUser = signal<Usuario | null>(null);

  setUser(u: Usuario | null): void {
    this.currentUser.set(u);
  }

  getUser(): Usuario | null {
    return this.currentUser();
  }
}
