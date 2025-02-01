import axios from "axios";
import type { AxiosInstance, CreateAxiosDefaults, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig  } from "axios";


// 发送请求时，自定义的请求和相应拦截
interface MyHttpInterceptors {
  requestInterceptor?: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig
  requestInterceptorCatch?: (error: any) => any
  responseInterceptor?: (config: AxiosResponse) => AxiosResponse
  responseInterceptorCatch?: (error: any) => any
}

// 允许用户传入自己自定义的 interceptor
interface MyHttpConfig extends CreateAxiosDefaults {
  interceptors?: MyHttpInterceptors
}


class MyHttp {
  instance: AxiosInstance
  interceptors?: MyHttpInterceptors

  constructor(config: MyHttpConfig) {
    this.instance = axios.create(config);
    this.interceptors = config.interceptors;

    // 自定义传进来的 interceptor 进行使用
    this.instance.interceptors.request.use(
      this.interceptors?.requestInterceptor,
      this.interceptors?.requestInterceptorCatch
    )

    this.instance.interceptors.response.use(
      this.interceptors?.responseInterceptor,
      this.interceptors?.responseInterceptorCatch
    )
  }

  request<T>(config: AxiosRequestConfig): Promise<T> {
    return this.instance
    .request<any, AxiosResponse<T>>(config)
    .then((response) => {
      // 可选：在这里添加全局响应处理逻辑
      return response.data;
    })
    .catch((error) => {
      // 可选：在这里添加全局错误处理逻辑
      console.error("请求失败:", error);
      throw error;
    });
  }
}

export const http1 = new MyHttp({
  // baseURL: "http://localhost:3000",
  interceptors: {
    
  }
})
