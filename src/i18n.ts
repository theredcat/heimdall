// Lightweight i18n: a translation dictionary + t() lookup, with the language
// persisted in localStorage and applied to [data-i18n*] elements in the static
// HTML. Dynamic strings (context menus, notifications) call t() directly.

export type Lang = 'en' | 'fr' | 'es'

const STORAGE_KEY = 'lang'
const SUPPORTED: Lang[] = ['en', 'fr', 'es']

const translations: Record<Lang, Record<string, string>> = {
	en: {
		'menu.filter': 'Filters',
		'menu.display': 'Display',
		'menu.status': 'Status',
		'menu.healthy': 'Healthy',
		'menu.unhealthy': 'Unhealthy',
		'menu.exited': 'Exited',
		'menu.links': 'Links',
		'menu.networks': 'Networks',
		'menu.application': 'Application',
		'menu.rearrange': 'Rearrange',
		'menu.language': 'Language',
		'filter.placeholder': 'Filter by name',
		'theme.toggle': 'Toggle dark mode',
		'action.info': 'Info',
		'action.logs': 'Logs',
		'action.stop': 'Stop',
		'action.restart': 'Restart',
		'action.shell': 'Shell',
		'action.start': 'Start',
		'action.delete': 'Delete',
		'action.linkReason': 'Link reason',
		'prompt.shellCommand': 'Shell command :',
		'notif.stopping': 'Stopping ...',
		'notif.hostStopped': 'Host stopped',
		'notif.restarting': 'Restarting',
		'notif.restarted': 'restarted',
		'notif.hostStarted': 'Host started',
		'notif.hostDeleted': 'Host deleted',
		'error.stopNotSupported': "This host provider doesn't support the stop action",
		'error.stopFailed': 'Failed to stop host',
		'error.restartNotSupported': "This host provider doesn't support the restart action",
		'error.restartFailed': 'Host restart failed',
		'error.startNotSupported': "This host provider doesn't support the start action",
		'error.failed': 'Failed',
		'error.notImplemented': 'Not implemented',
		'link.envVar': 'Environment variable',
		'link.dnsAlias': 'Matched DNS alias',
		'link.network': 'Through network',
		'link.noReason': 'No detailed reason available for this link.',
		'common.close': 'Close',
	},
	fr: {
		'menu.filter': 'Filtres',
		'menu.display': 'Affichage',
		'menu.status': 'Statut',
		'menu.healthy': 'Sain',
		'menu.unhealthy': 'Défaillant',
		'menu.exited': 'Arrêté',
		'menu.links': 'Liens',
		'menu.networks': 'Réseaux',
		'menu.application': 'Application',
		'menu.rearrange': 'Réorganiser',
		'menu.language': 'Langue',
		'filter.placeholder': 'Filtrer par nom',
		'theme.toggle': 'Basculer le mode sombre',
		'action.info': 'Infos',
		'action.logs': 'Journaux',
		'action.stop': 'Arrêter',
		'action.restart': 'Redémarrer',
		'action.shell': 'Terminal',
		'action.start': 'Démarrer',
		'action.delete': 'Supprimer',
		'action.linkReason': 'Raison du lien',
		'prompt.shellCommand': 'Commande du shell :',
		'notif.stopping': 'Arrêt en cours ...',
		'notif.hostStopped': 'Hôte arrêté',
		'notif.restarting': 'Redémarrage',
		'notif.restarted': 'redémarré',
		'notif.hostStarted': 'Hôte démarré',
		'notif.hostDeleted': 'Hôte supprimé',
		'error.stopNotSupported': "Ce fournisseur d'hôte ne supporte pas l'arrêt",
		'error.stopFailed': "Échec de l'arrêt de l'hôte",
		'error.restartNotSupported': "Ce fournisseur d'hôte ne supporte pas le redémarrage",
		'error.restartFailed': "Échec du redémarrage de l'hôte",
		'error.startNotSupported': "Ce fournisseur d'hôte ne supporte pas le démarrage",
		'error.failed': 'Échec',
		'error.notImplemented': 'Non implémenté',
		'link.envVar': "Variable d'environnement",
		'link.dnsAlias': 'Alias DNS correspondant',
		'link.network': 'Via le réseau',
		'link.noReason': 'Aucune raison détaillée disponible pour ce lien.',
		'common.close': 'Fermer',
	},
	es: {
		'menu.filter': 'Filtros',
		'menu.display': 'Visualización',
		'menu.status': 'Estado',
		'menu.healthy': 'Sano',
		'menu.unhealthy': 'Defectuoso',
		'menu.exited': 'Detenido',
		'menu.links': 'Enlaces',
		'menu.networks': 'Redes',
		'menu.application': 'Aplicación',
		'menu.rearrange': 'Reorganizar',
		'menu.language': 'Idioma',
		'filter.placeholder': 'Filtrar por nombre',
		'theme.toggle': 'Cambiar modo oscuro',
		'action.info': 'Información',
		'action.logs': 'Registros',
		'action.stop': 'Detener',
		'action.restart': 'Reiniciar',
		'action.shell': 'Terminal',
		'action.start': 'Iniciar',
		'action.delete': 'Eliminar',
		'action.linkReason': 'Motivo del enlace',
		'prompt.shellCommand': 'Comando del shell :',
		'notif.stopping': 'Deteniendo ...',
		'notif.hostStopped': 'Host detenido',
		'notif.restarting': 'Reiniciando',
		'notif.restarted': 'reiniciado',
		'notif.hostStarted': 'Host iniciado',
		'notif.hostDeleted': 'Host eliminado',
		'error.stopNotSupported': 'Este proveedor de host no admite la acción de detener',
		'error.stopFailed': 'Error al detener el host',
		'error.restartNotSupported': 'Este proveedor de host no admite la acción de reiniciar',
		'error.restartFailed': 'Error al reiniciar el host',
		'error.startNotSupported': 'Este proveedor de host no admite la acción de iniciar',
		'error.failed': 'Error',
		'error.notImplemented': 'No implementado',
		'link.envVar': 'Variable de entorno',
		'link.dnsAlias': 'Alias DNS coincidente',
		'link.network': 'A través de la red',
		'link.noReason': 'No hay motivo detallado disponible para este enlace.',
		'common.close': 'Cerrar',
	},
}

function detect(): Lang {
	try {
		const saved = localStorage.getItem(STORAGE_KEY) as Lang | null
		if (saved && SUPPORTED.indexOf(saved) >= 0) return saved
	} catch (e) { /* storage unavailable */ }
	const nav = (navigator.language || 'en').slice(0, 2).toLowerCase() as Lang
	return SUPPORTED.indexOf(nav) >= 0 ? nav : 'en'
}

let current: Lang = detect()

export function getLanguage(): Lang {
	return current
}

export function setLanguage(lang: Lang): void {
	if (SUPPORTED.indexOf(lang) < 0) return
	current = lang
	try { localStorage.setItem(STORAGE_KEY, lang) } catch (e) { /* storage unavailable */ }
	applyTranslations(document)
}

export function t(key: string): string {
	return translations[current][key] || translations.en[key] || key
}

// Translate [data-i18n] (textContent), [data-i18n-placeholder] and
// [data-i18n-title] elements within the given root.
export function applyTranslations(root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
		el.textContent = t(el.dataset.i18n as string)
	})
	root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
		el.placeholder = t(el.dataset.i18nPlaceholder as string)
	})
	root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
		el.title = t(el.dataset.i18nTitle as string)
	})
}
