export const state = {
    hospitalAliasMap: {},
    entries: [],
    filtered: [],
    selected: new Set(),
    selectedHospitals: new Set(),
    currentPage: 1,
    rowsPerPage: 20,
    isTrashMode: false,
    isMyDataMode: false,
    user: null,
    isAdminKey: sessionStorage.getItem('vnrad_admin_key') === 'true',
    isViewerRole: false,
    pendingQueue: JSON.parse(localStorage.getItem('drl_pending_queue') || '[]')
};

export const CONSTANTS = {
    LS_KEY_DATA: 'drl_data_cache',
    LS_KEY_PENDING: 'drl_pending_queue',
    VIEWER_EMAILS: ['syt@gmail.com', 'quanly@gmail.com'],
    ADMIN_EMAILS: ['thanhtrong.yds@gmail.com']
};

export const checkIsAdmin = (u) => state.isAdminKey || (u && u.email && CONSTANTS.ADMIN_EMAILS.includes(u.email.toLowerCase()));
