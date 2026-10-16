import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// As páginas são carregadas sob demanda (React.lazy): no runner da CI o primeiro import de uma
// rota pode passar de 1 s (padrão do Testing Library), deixando os `findBy*` intermitentes.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  try {
    window.sessionStorage.clear();
  } catch {
    // sessionStorage indisponível: nada a limpar.
  }
});
