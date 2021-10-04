import axios, { Method, ResponseType } from 'axios';

type bodyType = ('application/json' | 'application/x-www-form-urlencoded')

export class Request {
	baseUrl: URL

	constructor(url: URL) {
		this.baseUrl = url
	}

	get<T>(url: string, responseType: ResponseType = <ResponseType> 'json'): Promise<T> {
		return this.call(url, responseType, 'GET')
	}
	post<T>(url: string, body: any, responseType: ResponseType = <ResponseType> 'json', bodyType: bodyType = 'application/json'): Promise<T> {
		return this.call(url, responseType, 'POST', body, bodyType)
	}
	call<T>(url: string, responseType: ResponseType = <ResponseType> 'json', method: Method, body?: any, bodyType?: bodyType): Promise<T> {
		let callResult: T;
		let headers: { [key: string]: string} = {}
		if (url[0] != '/'){
			url = '/' + url
		}
		url = '.' + url

		if (bodyType) {
			headers['content-type'] = bodyType
		}

		return axios.request<T>({
			url: new URL(url, this.baseUrl).toString(),
			responseType,
			method,
			headers,
            data: body
		}).then((response) => {
			return response.data
		});
	}
}
