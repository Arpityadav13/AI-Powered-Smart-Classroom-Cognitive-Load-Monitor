import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

export const sessions = {
  getAll:      ()           => api.get('/sessions').then(r => r.data),
  get:         (id)         => api.get(`/sessions/${id}`).then(r => r.data),
  create:      (data)       => api.post('/sessions', data).then(r => r.data),
  end:         (id, notes)  => api.patch(`/sessions/${id}/end`, { notes }).then(r => r.data),
  getReadings: (id)         => api.get(`/sessions/${id}/readings`).then(r => r.data),
  getAlerts:   (id)         => api.get(`/sessions/${id}/alerts`).then(r => r.data),
  exportCSV:   (id)         => window.open(`/api/sessions/${id}/export`, '_blank'),
}

export const analytics = {
  summary:   (sid) => api.get(`/analytics/${sid}/summary`).then(r => r.data),
  timeline:  (sid) => api.get(`/analytics/${sid}/timeline`).then(r => r.data),
  students:  (sid) => api.get(`/analytics/${sid}/students`).then(r => r.data),
  multiTrend: ()   => api.get('/analytics/trend/multi').then(r => r.data),
}

export const students = {
  getAll:  ()                       => api.get('/students').then(r => r.data),
  update:  (faceId, name, seat='') => api.put(`/students/${faceId}`, { name, seat }).then(r => r.data),
}

export default api
