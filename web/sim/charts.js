// Repositório de charts do Helm disponível na rede do laboratório.
import { REGISTRY } from './images.js';

export const REPO_URL = 'http://helm.lab.example.com/charts';
// O guia de laboratório chama o mesmo repositório de helm.ocp4.example.com.
export const REPO_URLS = [REPO_URL, 'http://helm.ocp4.example.com/charts'];
export const ehRepo = (url) => REPO_URLS.includes(url);

function helpers(n) {
  return `{{/*
Expand the name of the chart.
*/}}
{{- define "${n}.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
If release name contains chart name it will be used as a full name.
*/}}
{{- define "${n}.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "${n}.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{ include "${n}.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "${n}.selectorLabels" -}}
app.kubernetes.io/name: {{ include "${n}.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
`;
}

function deployment(n) {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${n}.fullname" . }}
  labels:
    {{- include "${n}.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "${n}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "${n}.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
          {{- with .Values.env }}
          env:
            {{- range $key, $value := . }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
          {{- end }}
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
`;
}

function service(n) {
  return `apiVersion: v1
kind: Service
metadata:
  name: {{ include "${n}.fullname" . }}
  labels:
    {{- include "${n}.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "${n}.selectorLabels" . | nindent 4 }}
`;
}

function route(n) {
  return `{{- if .Values.route.enabled -}}
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: {{ include "${n}.fullname" . }}
  labels:
    {{- include "${n}.labels" . | nindent 4 }}
spec:
  {{- with .Values.route.host }}
  host: {{ . }}
  {{- end }}
  to:
    kind: Service
    name: {{ include "${n}.fullname" . }}
  port:
    targetPort: http
  {{- if .Values.route.tls }}
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect
  {{- end }}
{{- end }}
`;
}

function notas(n) {
  return `{{ .Chart.Name }} {{ .Chart.AppVersion }} was deployed as release {{ .Release.Name }} in project {{ .Release.Namespace }}.
{{- if .Values.route.enabled }}

Access the application at:
  http{{ if .Values.route.tls }}s{{ end }}://{{ .Values.route.host | default (printf "%s-%s.apps.lab.example.com" (include "${n}.fullname" .) .Release.Namespace) }}
{{- else }}

The application is not exposed. Enable the route with:
  --set route.enabled=true
{{- end }}
`;
}

function valores(n, imagem, rota = false) {
  return `# Default values for ${n}.
# This is a YAML-formatted file.

replicaCount: 1

image:
  repository: ${REGISTRY}/${imagem}
  # Overrides the image tag whose default is the chart appVersion.
  tag: ""

nameOverride: ""
fullnameOverride: ""

service:
  type: ClusterIP
  port: 8080

route:
  # Creates an OpenShift route for the service.
  enabled: ${rota}
  # Leave empty to let OpenShift generate the host name.
  host: ""
  # Uses edge TLS termination and redirects HTTP to HTTPS.
  tls: false

# Extra environment variables, as NAME: value pairs.
env: {}

resources: {}
  # limits:
  #   cpu: 500m
  #   memory: 256Mi
  # requests:
  #   cpu: 100m
  #   memory: 128Mi
`;
}

function chart(n, versao, appVersion, descricao, imagem, rota = false) {
  return {
    versao,
    appVersion,
    descricao,
    files: {
      'Chart.yaml': `apiVersion: v2\nname: ${n}\ndescription: ${descricao}\ntype: application\nversion: ${versao}\nappVersion: "${appVersion}"\nmaintainers:\n  - name: Nimbus Platform Team\n`,
      'values.yaml': valores(n, imagem, rota),
      'README.md': `# ${n}\n\n${descricao}\n\nInstall with:\n\n    helm install ${n} nimbus/${n}\n\nSee values.yaml for the configurable parameters.\n`,
      'templates/_helpers.tpl': helpers(n),
      'templates/deployment.yaml': deployment(n),
      'templates/service.yaml': service(n),
      'templates/route.yaml': route(n),
      'templates/NOTES.txt': notas(n),
    },
  };
}

// Charts por nome, da versão mais antiga para a mais nova.
export const CHARTS = {
  etherpad: [
    chart('etherpad', '0.0.6', '1.8.0', 'Real-time collaborative editor (Etherpad)', 'redhattraining/etherpad', true),
    chart('etherpad', '0.0.7', '1.8.0', 'Real-time collaborative editor (Etherpad)', 'redhattraining/etherpad', true),
  ],
  inventory: [
    chart('inventory', '0.1.0', '3.2', 'Inventory service for Nimbus', 'nimbus/inventory'),
    chart('inventory', '0.2.0', '3.3', 'Inventory service for Nimbus', 'nimbus/inventory'),
  ],
  portal: [
    chart('portal', '0.1.0', '1.0', 'Nimbus customer portal', 'nimbus/portal'),
    chart('portal', '0.2.0', '1.1', 'Nimbus customer portal', 'nimbus/portal'),
    chart('portal', '0.3.0', '2.1', 'Nimbus customer portal', 'nimbus/portal'),
  ],
  reports: [
    chart('reports', '1.0.0', '4.0', 'Scheduled financial reports for Nimbus', 'nimbus/reports'),
    chart('reports', '1.1.0', '4.1', 'Scheduled financial reports for Nimbus', 'nimbus/reports'),
  ],
};
