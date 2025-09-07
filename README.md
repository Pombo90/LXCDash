# LXCDash

**LXCDash** es una interfaz web ligera para gestionar contenedores LXC en tu servidor Proxmox, desde un contenedor Debian.

> ⚠️ Este script **no crea el contenedor LXC automáticamente**. Debes crear primero un contenedor Debian (por ejemplo, Debian 12), luego ejecutar el instalador desde dentro.

---

## 📦 Requisitos

- Un contenedor LXC con:
  - Sistema operativo: **Debian 12**
  - Acceso a internet
  - Usuario `root` o privilegios `sudo`

---

## 🚀 Instalación

1. Accede al contenedor (como root):

   ```bash
   pct exec <ID_DEL_LXC> -- bash
