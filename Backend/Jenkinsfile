pipeline {
    agent any
    options {
        skipDefaultCheckout(true)
    }

    environment {
        IMAGE_NAME = "solar_power_backend"
        IMAGE_TAG = "latest"
        DEPLOY_DIR = "/opt/projects/solar-power/backend"
    }

    stages {

        stage('Clone Bitbucket') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        credentialsId: '',
                        url: 'https://github.com/ShradhaVastrakar/xqtmnp.git'
                    ]]
                ])
            }
        }

        stage('Prepare Deploy Folder & Copy ENV') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'solar_power_backend_env',
                        variable: 'ENV_FILE'
                    )
                ]) {
                    sh '''
                        set -e

                        mkdir -p "${DEPLOY_DIR}"

                        cp Dockerfile "${DEPLOY_DIR}/Dockerfile"
                        cp docker-compose.yml "${DEPLOY_DIR}/docker-compose.yml"
                        cp "$ENV_FILE" "${DEPLOY_DIR}/.env"

                        chmod 600 "${DEPLOY_DIR}/.env"
                    '''
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                    set -e

                    docker build \
                        -t "${IMAGE_NAME}:${IMAGE_TAG}" .
                '''
            }
        }

        stage('Deploy Container') {
            steps {
                sh '''
                    set -e

                    cd "${DEPLOY_DIR}"

                    echo "Validating Docker Compose configuration..."
                    docker compose config -q

                    echo "Starting updated container..."
                    docker compose up -d --build --force-recreate

                    echo "Deployment command completed."
                '''
            }
        }

        stage('Verify Deployment') {
            steps {
                sh '''
                    set -e

                    cd "${DEPLOY_DIR}"

                    echo "Checking running containers..."
                    docker compose ps

                    echo "Checking backend container..."
                    docker ps --filter "name=solar_power_backend"

                    echo "Backend logs:"
                    docker logs --tail 50 solar_power_backend
                '''
            }
        }

        stage('Clean Up Docker Images') {
            steps {
                sh '''
                    docker image prune -f
                '''
            }
        }
    }

    post {
        success {
            echo "Solar Power Backend deployed successfully."
        }

        failure {
            echo "Solar Power Backend deployment failed."

            sh '''
                docker ps -a || true
                docker images | grep solar_power_backend || true

                if [ -f "${DEPLOY_DIR}/docker-compose.yml" ]; then
                    cd "${DEPLOY_DIR}"
                    docker compose logs --tail 50 || true
                fi
            '''
        }
    }
}