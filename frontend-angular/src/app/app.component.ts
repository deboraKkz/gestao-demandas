import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from './core/services/api.service';
import { UserService, Usuario } from './core/services/user.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  private api = inject(ApiService);
  userService = inject(UserService);

  users = signal<Usuario[]>([]);
  selectedUserId = signal<number | null>(null);
  theme = signal<'theme-dark' | 'theme-light'>('theme-dark');
  menuOpen = signal(false);

  ngOnInit(): void {
    // Restore theme
    const saved = localStorage.getItem('theme');
    const t = saved === 'theme-light' ? 'theme-light' : 'theme-dark';
    this.theme.set(t);
    document.body.className = t;

    // Load users for mock login
    this.api.get<Usuario[]>('/auth/users').subscribe({
      next: (list) => {
        this.users.set(list);
        if (list.length > 0) {
          const first = list[0];
          this.selectedUserId.set(first.id);
          this.userService.setUser(first);
        }
      },
      error: () => {}
    });
  }

  onUserChange(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    this.selectedUserId.set(id);
    const user = this.users().find(u => u.id === id) ?? null;
    this.userService.setUser(user);
    this.menuOpen.set(false);
  }

  toggleTheme(): void {
    const next = this.theme() === 'theme-dark' ? 'theme-light' : 'theme-dark';
    this.theme.set(next);
    document.body.className = next;
    localStorage.setItem('theme', next);
  }

  toggleMenu(): void {
    this.menuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  get isDiretor(): boolean {
    const role = this.userService.currentUser()?.role;
    return role === 'diretor' || role === 'admin';
  }

  get isAdmin(): boolean {
    return this.userService.currentUser()?.role === 'admin';
  }
}
