# **Express Installation of Unoapi Cloud and Chatwoot Uno**
![Unoapi_logo](https://github.com/user-attachments/assets/05cbe5ab-c638-4613-a817-c9d9ce3f4b34)

## **Introduction**
This material covers the installation and initial configuration of Unoapi Cloud and Chatwoot Uno. It is recommended to have basic knowledge in the following areas:
- Portainer
- Communication API
- Docker
- Linux Debian or Ubuntu
- Domains

## Server Setup

### Requirements
- It is recommended to use **Debian** or **Ubuntu** in the latest versions.
- The initial setup can be automated with a script that installs the necessary dependencies.

### Automatic Server Provisioning (Debian or Ubuntu)
Note: This script assumes that your machine is not in production. If you have Docker installed in standalone mode and a network defined, you can proceed to the next step.
Run the following commands as **root** or with **sudo**:
```bash
wget https://raw.githubusercontent.com/clairton/unoapi-cloud/refs/heads/main/examples/scripts/serverSetup.sh
sudo sh serverSetup.sh
```
This script will uninstall any version of Docker (if installed) and install the most current version of Docker ce
After installing, the script will ask for the name of the Docker network (default: `network`).
![image](https://github.com/user-attachments/assets/75fd3c69-4b00-443c-b3fd-d8a8bed21141)
### Docker Verification
After installation, verify that Docker is running:
```bash
docker ps -a
service docker status
```
![image](https://github.com/user-attachments/assets/04cc55f9-2675-46b3-a79c-f0017b15f08d)

## Automatic Stack Creation

### Variable Configuration
To define the variables for the stacks that will be used to launch the services, run:
```bash
wget https://raw.githubusercontent.com/clairton/unoapi-cloud/refs/heads/main/examples/scripts/envSetup.sh
sudo sh envSetup.sh
```

Answer the requested questions. Only **email, domain and Docker network** are required. Note: Docker network name must be the same as the one used in the initial setup or the name of your network created in docker!.

![image](https://github.com/user-attachments/assets/91db1427-c279-4aec-90c9-9dca8a0aeb0a)

The generated files will be:
- `docker-compose.yaml`
- `apps-compose.yaml`

### Docker Compose Initialization
```bash
docker compose up -d
```
Wait for the images to load. Once stabilized, access **Portainer** at the domain defined in the `.env` file.

To view the `.env` values, use:
```bash
cat .env
```
Example of an initial .env file:
![image](https://github.com/user-attachments/assets/cd0e2fa2-31ac-4eb5-9bb0-d05f77c8aa97)

Access Portainer and:
1. Copy the contents of `apps-compose.yaml`.
2. Paste it into the `apps` stack inside Portainer.
3. Start the stack.

![image](https://github.com/user-attachments/assets/20516ae2-af81-4662-a46e-689a39d43db2)

## Minio Configuration

Access Minio in the domain with the username and password defined or created in the `.env` file (**`cat .env`**) configure:
- **Menu > Configuration > Region** → Set a value (e.g. `br`).
- **Menu > Buckets** → Create 2 buckets (`unoapi` and `chatwoot`).
- **Edit the created buckets** → Set the access policy to **public**.
- **Menu > Access Keys > Create Access Key** → Generate and save `Access Key` and `Secret Key`.
![image](https://github.com/user-attachments/assets/09f618bf-a9ba-4c9b-a6ec-8e5557f8bffd)
![image](https://github.com/user-attachments/assets/731d9cc9-dbab-408d-8aca-db2fd7f89c04)

## Finalizing the Configurations

Re-run the `envSetup.sh` script:
```bash
sh envSetup.sh
```
Choose **Option 1** and enter:
- Minio Region
- Bucket names (`unoapi` and `chatwoot`)
- Access keys

### Creating Unoapi and Chatwoot Stacks
To create the chatwoot and unoapi stacks, there are Options **2 and 3**. You use them after configuring the envs.

Confirm the version through the prompt and wait for the automatic creation of the stacks.

![image](https://github.com/user-attachments/assets/7824ad8e-3eaf-4461-849c-a8dfe5f59cd8)

The generated files will be:
- `docker-chatwoot.yaml`
- `docker-unoapi.yaml`

Copy the contents of these files and create **two new stacks** in Portainer.

## Initial Chatwoot Configuration
1. Access **Chatwoot** in the configured domain.
2. Navigate to **Super Admin**:
- **Accounts > Edit -> Company Created** → Check the option **"channel_whatsapp"** and save. - **Settings > Unoapi** → Configure with the `UNOAPI_AUTH_TOKEN` key (get it with `cat .env`).
![image](https://github.com/user-attachments/assets/46f020db-0258-4b68-a07f-28de172b956e)
![image](https://github.com/user-attachments/assets/19bc487d-dae9-42b4-9f66-57a23c325d8d)

3. In the Chatwoot dashboard:
- **Add Box > WhatsApp > Unoapi** → Fill in the requested fields.
- **Next step > Select agents**.
- **More settings > Unoapi Config tab** → Save.
- Generate the QR Code for authentication.
![image](https://github.com/user-attachments/assets/24762a7b-cf2a-4581-8201-aafa09e3d4a4)

## Conclusion
Now Unoapi Cloud and Chatwoot Uno are set up and connected!