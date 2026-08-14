jest.mock('../../src/defaults', () => ({
  ...jest.requireActual('../../src/defaults'),
  UNOAPI_AUTH_TOKEN: 'global-secret',
  UNOAPI_HEADER_NAME: 'Authorization',
}))

import { NextFunction, Request, Response } from 'express'
import { mock } from 'jest-mock-extended'
import Security from '../../src/services/security'
import { SessionStore } from '../../src/services/session_store'

describe('profile picture route authentication', () => {
  const request = (authorization = '') => ({
    path: '/v13.0/5566999424178/profile-pictures/5566999069708',
    method: 'GET',
    params: { session: '5566999424178' },
    headers: authorization ? { authorization } : {},
    query: {},
    body: {},
  }) as unknown as Request

  test('returns 401 when no token is provided', async () => {
    const sessionStore = mock<SessionStore>()
    const response = mock<Response>()
    response.status.mockReturnThis()
    const next = jest.fn() as NextFunction

    await new Security(sessionStore).run(request(), response, next)

    expect(response.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  test('uses the session route parameter to validate a session token', async () => {
    const sessionStore = mock<SessionStore>()
    sessionStore.getTokens.mockResolvedValue(['session-secret'])
    const response = mock<Response>()
    const next = jest.fn() as NextFunction

    await new Security(sessionStore).run(request('Bearer session-secret'), response, next)

    expect(sessionStore.getTokens).toHaveBeenCalledWith('5566999424178')
    expect(next).toHaveBeenCalledTimes(1)
  })
})
