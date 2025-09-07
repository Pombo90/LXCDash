*WORK IN PROGRESS*

# LXCDash

**LXCDash** es un panel web ligero para gestionar contenedores LXC en Proxmox de forma rápida, visual e intuitiva.  
Está diseñado para ejecutarse desde un contenedor Debian dentro de tu infraestructura Proxmox y accederse vía navegador.

---

## 🚀 ¿Qué hace LXCDash?

- Muestra todos tus contenedores LXC activos (en todos los estados)
- Permite iniciar, detener o reiniciar contenedores con un clic
- Indica el estado (ejecutándose / detenido) de cada uno
- Tiene selector de idioma (Español / Inglés)
- Accesible desde cualquier navegador dentro de tu red local

---

## 🧱 Requisitos

### 1. Crear el contenedor LXC manualmente

Antes de instalar LXCDash, crea un contenedor LXC en Proxmox con los siguientes requisitos mínimos:

| Requisito       | Valor recomendado                  |
|-----------------|-------------------------------------|
| **Plantilla**   | `debian-12-standard_amd64.tar.zst` |
| **RAM**         | 512 MB (mínimo), 1 GB recomendado   |
| **CPU**         | 1 vCPU                              |
| **Disco**       | 4 GB                                |
| **Tipo**        | Privilegiado o no privilegiado ✅    |
| **Red**         | IP accesible desde tu LAN           |
| **Acceso root** | Obligatorio                         |
| **Internet**    | El contenedor debe tener acceso     |

---

## ⚙️ Instalación

Una vez creado y arrancado el contenedor Debian, entra en él (por consola o SSH) y ejecuta el siguiente comando:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Pombo90/LXCDash/main/lxcdash.sh)"
```

> ℹ️ **Durante la instalación**, se te pedirá que introduzcas:
>
> - La IP o nombre del nodo Proxmox donde se ejecutan los LXC
> - El **token de API de Proxmox** (nombre de usuario, ID de token y clave secreta)
> - El **nombre del nodo** (por ejemplo: `pve`)
>
> Estos datos son necesarios para que LXCDash pueda consultar el estado de los contenedores y enviar acciones como start, stop o reboot.

Este script:

- Instala las dependencias necesarias (`nginx`, `nodejs`, `pm2`, etc.)
- Copia los archivos de la interfaz web en `/opt/lxcdash/web`
- Configura `nginx` para servirla en el puerto **8080**
- Inicia la API como servicio persistente usando `pm2`

---

## 🌐 Acceso a la interfaz

Abre tu navegador y entra en:

```
http://<IP_DEL_LXC>:8080
```

---

## 🌍 Selector de idioma

LXCDash está disponible en:

- Español 🇪🇸  
- Inglés 🇬🇧

Puedes cambiar el idioma en la esquina superior derecha de la interfaz.

---

## 📁 Estructura del repositorio

```
.
├── lxcdash.sh               # Script de instalación principal
├── web/                     # Archivos de la interfaz web
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── lang/
│       ├── en.json
│       └── es.json
└── README.md
```
