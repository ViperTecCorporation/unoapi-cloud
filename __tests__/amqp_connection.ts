const connect = jest.fn()

jest.mock('amqplib', () => ({ connect }))

import { amqpConnect } from '../src/amqp'

describe('AMQP connection', () => {
  test('shares concurrent connects and attaches lifecycle handlers once', async () => {
    const connection = {
      on: jest.fn(),
      createChannel: jest.fn(),
      close: jest.fn(),
    }
    connect.mockResolvedValue(connection)

    const [first, second] = await Promise.all([
      amqpConnect('amqp://test'),
      amqpConnect('amqp://test'),
    ])
    await amqpConnect('amqp://test')

    expect(first).toBe(connection)
    expect(second).toBe(connection)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(connection.on).toHaveBeenCalledTimes(2)
    expect(connection.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(connection.on).toHaveBeenCalledWith('close', expect.any(Function))
  })
})
