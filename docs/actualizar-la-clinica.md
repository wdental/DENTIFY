# Cómo actualizar Dentify en la clínica

Guía para la persona que actualiza el sistema en la computadora de la clínica.
Hacerlo **de noche o antes de abrir**, nunca con doctores atendiendo.

> **Regla de oro**: la rama `main` de GitHub es exactamente lo que está corriendo en la
> clínica. Si algo está en `main`, es porque ya se probó y se aprobó para instalar.

---

## Antes de empezar

1. Que **todos cierren Dentify**, incluida la ventana negra de consola.
2. Verificar que nadie esté usando el sistema desde otro equipo de la red.

## 1. Traer la versión nueva

Abrir el Explorador en la carpeta de Dentify (donde está `iniciar-dentify.bat`), hacer clic
en la barra de direcciones, escribir `cmd` y Enter. Luego:

```
git pull
```

## 2. Ensayar la actualización (sin riesgo)

```
node scripts/probar-actualizacion.js
```

Hace una **copia** de la base y corre la actualización sobre la copia. La base real no se
modifica. Al final dice una de dos cosas:

- **`SIN PERDIDA DE DATOS. La actualizacion es segura.`** → continuar con el paso 3.
- **`ATENCION: LA ACTUALIZACION PIERDE DATOS`** o **`LA ACTUALIZACION FALLO`** → **detenerse
  aquí**. No arrancar Dentify. Avisar copiando el mensaje completo. La clínica sigue
  funcionando con la versión anterior sin problema.

## 3. Guardar una copia de la base

Copiar `db/dentify.db` a un USB o disco externo, con la fecha en el nombre.

Dentify guarda copias solo (en `backups/`: una por día, otra cada 6 horas y una antes de cada
actualización), **pero todas viven en la misma computadora**. La copia que de verdad protege
es la que está fuera de ese equipo.

## 4. Arrancar y revisar

Doble clic en `iniciar-dentify.bat`. En la ventana negra pueden aparecer líneas como:

```
Respaldo previo a la actualizacion: dentify-antes-de-actualizar-2026-09-14-2130.db
Migracion: ...
Servidor activo en el puerto 3000
```

Eso es normal: la primera línea es la copia de seguridad que Dentify se hace solo antes de
cambiar la estructura de la base.

En el navegador, **Ctrl+F5** en `localhost:3000` para que tome los archivos nuevos, y revisar
en dos minutos:

- Abrir un paciente y ver su ficha.
- Abrir la Agenda del día.
- Abrir Caja.

Si los tres cargan, la actualización quedó.

---

## Si algo salió mal: volver atrás

Con Dentify cerrado:

```
git log --oneline -5          (anotar el código de la versión anterior)
git checkout <código>
```

Y restaurar la base: copiar el archivo de `backups/` que empieza con
`dentify-antes-de-actualizar-` (el de la fecha y hora de la actualización) sobre
`db/dentify.db`. Después arrancar normalmente.

Para volver a la última versión más adelante: `git checkout main`.

---

## Qué NUNCA se pierde al actualizar

`git pull` solo cambia archivos de código. **No toca** la base de datos, los documentos de
los pacientes, las firmas, los respaldos ni las credenciales de Google: todos están fuera de
git (ver `.gitignore`). Lo único que modifica los datos son las migraciones, que están
escritas para conservar todas las filas — y que ahora guardan una copia antes de empezar.
