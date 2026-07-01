import api from "@/services/api"

export async function getHealth() {
    const response = await api.get("/health")
    return response.data
}
