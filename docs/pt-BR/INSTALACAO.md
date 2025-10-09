# **Instalação Expressa Unoapi Cloud e Chatwoot Uno**
![Unoapi_logo](https://github.com/user-attachments/assets/05cbe5ab-c638-4613-a817-c9d9ce3f4b34)

## **Introdução**
Este material aborda a instalação e configuração inicial da Unoapi Cloud e Chatwoot Uno. É recomendável ter conhecimentos básicos nas seguintes áreas:
- Portainer
- API de comunicação
- Docker
- Linux Debian ou Ubuntu
- Domínios

## Setup do Servidor

### Requisitos
- Recomenda-se o uso de **Debian** ou **Ubuntu** nas últimas versões.
- O setup inicial pode ser automatizado com um script que instala as dependências necessárias.

### Provisionamento Automático do Servidor (Debian ou Ubuntu)
Obs.: Este script leva em consideração que sua máquina não está em produção, Caso você tenha o docker em modo standalone instalado e rede definida pode seguir para a próxima etapa.
Execute os seguintes comandos como **root** ou com **sudo**:
```bash
wget https://raw.githubusercontent.com/clairton/unoapi-cloud/refs/heads/main/examples/scripts/serverSetup.sh
sudo sh serverSetup.sh
```
Este script irá desinstalar qualquer versão do docker (se houver instalada) e instalar a versão mais atual do docker ce
Após instalar, o script irá solicitar o nome da rede Docker (padrão: `network`).
![image](https://github.com/user-attachments/assets/75fd3c69-4b00-443c-b3fd-d8a8bed21141)
### Verificação do Docker
Após a instalação, verifique se o Docker está rodando:
```bash
docker ps -a
service docker status
```
![image](https://github.com/user-attachments/assets/04cc55f9-2675-46b3-a79c-f0017b15f08d)

## Criação Automática das Stacks

### Configuração de Variáveis
Para definir as variáveis para as stacks que serão usadas para subir os serviços, execute:
```bash
wget https://raw.githubusercontent.com/clairton/unoapi-cloud/refs/heads/main/examples/scripts/envSetup.sh
sudo sh envSetup.sh
```

Responda as perguntas solicitadas. Apenas **email, domínio e rede do Docker** são obrigatórios. Observação: nome da rede Docker deve ser o mesmo usado no setup inicial ou o nome da sua rede criada no docker!.

![image](https://github.com/user-attachments/assets/91db1427-c279-4aec-90c9-9dca8a0aeb0a)

Os arquivos gerados serão:
- `docker-compose.yaml`
- `apps-compose.yaml`

### Inicialização do Docker Compose
```bash
docker compose up -d
```
Aguarde o carregamento das imagens. Depois de estabilizado, acesse o **Portainer** no domínio definido no arquivo `.env`.

Para visualizar os valores do `.env`, use:
```bash
cat .env
```
Exemplo de um arquivo .env inicial:
![image](https://github.com/user-attachments/assets/cd0e2fa2-31ac-4eb5-9bb0-d05f77c8aa97)

Acesse o Portainer e:
1. Copie o conteúdo de `apps-compose.yaml`.
2. Cole na stack `apps` dentro do Portainer.
3. Inicie a stack.

![image](https://github.com/user-attachments/assets/20516ae2-af81-4662-a46e-689a39d43db2)


## Configuração do Minio

Acesse o Minio no domínio com usuário e senha definido ou criado no arquivo `.env` (**`cat .env`**) configure:
- **Menu > Configuration > Region** → Defina um valor (ex: `br`).
- **Menu > Buckets** → Crie 2 buckets (`unoapi` e `chatwoot`).
- **Edite os buckets criados** → Defina a política de acesso como **pública**.
- **Menu > Access Keys > Create Access Key** → Gere e salve `Access Key` e `Secret Key`.
![image](https://github.com/user-attachments/assets/09f618bf-a9ba-4c9b-a6ec-8e5557f8bffd)
![image](https://github.com/user-attachments/assets/731d9cc9-dbab-408d-8aca-db2fd7f89c04)


## Finalização das Configurações

Reexecute o script `envSetup.sh`:
```bash
sh envSetup.sh
```
Escolha a **Opção 1** e informe:
- Região do Minio
- Nome dos buckets (`unoapi` e `chatwoot`)
- Chaves de acesso

### Criação das Stacks Unoapi e Chatwoot
Para criar as stacks do chatwoot e unoapi há as Opções **2 e 3**. Você utiliza elas após configurar as envs.
Confirme a versão através do prompt e aguarde a criação automática das stacks.
![image](https://github.com/user-attachments/assets/7824ad8e-3eaf-4461-849c-a8dfe5f59cd8)

Os arquivos gerados serão:
- `docker-chatwoot.yaml`
- `docker-unoapi.yaml`

Copie o conteúdo desses arquivos e crie **duas novas stacks** no Portainer.

## Configuração Inicial do Chatwoot
1. Acesse o **Chatwoot** no domínio configurado.
2. Navegue até **Super Admin**:
   - **Accounts > Editar -> Empresa Criada** → Marque a opção **"channel_whatsapp"** e salve.
   - **Settings > Unoapi** → Configure com a chave `UNOAPI_AUTH_TOKEN` (obtenha com `cat .env`).
![image](https://github.com/user-attachments/assets/46f020db-0258-4b68-a07f-28de172b956e)
![image](https://github.com/user-attachments/assets/19bc487d-dae9-42b4-9f66-57a23c325d8d)

3. No painel do Chatwoot:
   - **Adicionar Caixa > WhatsApp > Unoapi** → Preencha os campos solicitados.
   - **Próximo passo > Selecionar agentes**.
   - **Mais configurações > Aba Unoapi Config** → Salve.
   - Gere o QR Code para autenticação.
![image](https://github.com/user-attachments/assets/24762a7b-cf2a-4581-8201-aafa09e3d4a4)

## Conclusão
Agora a Unoapi Cloud e o Chatwoot Uno estão configurados e conectados!
