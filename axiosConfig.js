const BASE_URL = `${window.location.protocol}//${window.location.hostname}${
  window.location.port ? ":" + window.location.port : ""
}`;

const axiosInstance = axios.create({
  baseURL: BASE_URL,
});

const axiosProtected = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

function createSignal(route) {
  // Add signal creation logic here
  return new AbortController().signal;
}

const get = async (route, query = null) => {
  try {
    const signal = createSignal(route);
    const response = await axiosProtected.get(route, {
      params: query,
      signal: signal,
    });
    return response.data;
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("Request was cancelled");
      return null;
    }
    throw error;
  }
};

export { get, axiosInstance, axiosProtected };
