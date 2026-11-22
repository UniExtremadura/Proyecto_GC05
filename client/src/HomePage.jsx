
import { LogoutButton } from './LogoutButton.jsx';

const sections = [
  [
    'Objetos encontrados',
    'Publica lo que encuentres y consulta los hallazgos del campus.',
    'Consulta y búsqueda pendientes · US-009',
  ],
  [
    'Avisos de pérdida',
    'Un espacio para avisar de lo que has perdido.',
    'Publicación y consulta de avisos · US-013 y US-014',
  ],
  [
    'Tu perfil',
    'Tus datos y la información de contacto.',
    'Pendiente de integración · US-005',
  ],
];

/** Portada de la aplicación con acceso al perfil y cierre de sesión. */
export function HomePage({
  user,
  demo = false,
  onLogout,
  onDemo,
  notice,
}) {
  return (
    <main className="home">
      <header className="home-header">
        <a
          className="brand"
          href={user ? '#app' : '#portada'}
        >
          Lost&Found UEx
        </a>

        {user ? (
          <LogoutButton
            demo={demo}
            onLogout={onLogout}
          />
        ) : (
          <nav aria-label="Acceso a tu cuenta">
            <a href="#inicio-sesion">Iniciar sesión</a>
            <a className="button-link" href="#registro">
              Crear cuenta
            </a>
          </nav>
        )}
      </header>

      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}

      {demo && (
        <p className="demo-banner" role="status">
          Demostración visual: no hay una sesión real ni se
          envían peticiones de acceso o cierre.
        </p>
      )}

      <section className="hero" aria-labelledby="home-title">
        <span className="eyebrow">
          OBJETOS PERDIDOS Y ENCONTRADOS · CAMPUS UEx
        </span>

        <h1 id="home-title">
          Que perder algo sea solo el principio de encontrarlo.
        </h1>

        <p>
          Un punto de encuentro para ayudar a que los objetos
          vuelvan a sus dueños.
        </p>

        {user ? (
          <p>
            Bienvenido: <strong>{user.email}</strong>
          </p>
        ) : (
          <>
            <div className="hero-actions">
              <a className="button-link" href="#inicio-sesion">
                Entrar en mi cuenta
              </a>

              <a href="#registro">
                Quiero registrarme
              </a>
            </div>

            {onDemo && (
              <button
                className="demo-link"
                type="button"
                onClick={onDemo}
              >
                Ver demostración sin API
              </button>
            )}
          </>
        )}
      </section>

      <section
        className="home-grid"
        aria-label="Espacios de la plataforma"
      >
        {sections.map(([title, description, status]) => (
          <article className="card" key={title}>
            <h2>{title}</h2>
            <p>{description}</p>

            {title === 'Tu perfil' && user && !demo ? (
              <p>
                <a href="#perfil">
                  Acceder a mi perfil
                </a>
              </p>
            ) : title === 'Objetos encontrados' && user && !demo ? (
              <>
                <p>
                  <a href="#buscar-hallazgos">
                    Buscar hallazgos
                  </a>
                </p>
                <p>
                  <a href="#publicar-hallazgo">
                    Publicar un hallazgo
                  </a>
                </p>
                <p>
                  <a href="#mis-hallazgos">
                    Mis hallazgos
                  </a>
                </p>
              </>
            ) : title === 'Avisos de pérdida' && user && !demo ? (
              <>
                <p>
                  <a href="#publicar-aviso">
                    Publicar un aviso de pérdida
                  </a>
                </p>
                <p>
                  <a href="#feed-avisos">
                    Consultar avisos de pérdida
                  </a>
                </p>
                <p>
                  <a href="#cerrar-avisos">Cerrar mis avisos</a>
                </p>
                <p>
                  <a href="#mis-avisos">
                    Mis avisos de pérdida
                  </a>
                </p>
              </>
            ) : (
              <p className="help">{status}</p>
            )}
          </article>
        ))}
      </section>

      <footer>
        Lost&Found UEx · Proyecto académico GPS
      </footer>
    </main>
  );
}
