# LXCDash

**LXCDash** es una interfaz web ligera para gestionar contenedores LXC en tu servidor Proxmox, desde un contenedor Debian.

> ⚠️ Este script **no crea el contenedor LXC automáticamente**. Debes crearlo manualmente en Proxmox y luego ejecutar el instalador dentro del contenedor.

---

## 🧱 Requisitos del contenedor LXC

Crea un contenedor con las siguientes especificaciones mínimas:

- 🔹 **Plantilla**: Debian 12 estándar  
- 🧠 **RAM**: 512 MB (recomendado: 1 GB)  
- 🧮 **CPU**: 1 vCPU  
- 💾 **Disco**: 4 GB  
- 🌐 **Red**: DHCP o IP estática accesible  
- ⚙️ **Tipo**: Puede ser *privilegiado* o *no privilegiado*. Ambos son compatibles.  
- 📥 **Acceso a internet** dentro del LXC  
- 🔐 Acceso root (o usuario con `sudo`)  

> 📝 Puedes usar la plantilla `debian-12-standard_amd64.tar.zst` desde Proxmox (catálogo oficial) al crear el contenedor.

---

## 🚀 Instalación

1. Accede al contenedor:

   ```bash
   pct exec <ID_DEL_LXC> -- bash
