import { Either, fromPromise, ap, right, getOrElse, flatten, map, left } from './fp/either';
import { pipe } from './fp/utils';
import { fetchClient, fetchExecutor } from './fetching';
import { ClientUser, Demand, ExecutorUser } from './types';
import { fromNullable, fold as foldMaybe } from './fp/maybe';
import { sort } from './fp/array';
import { fromCompare, ordNumber, revert } from './fp/ord';
import { distance } from './utils';

type Response<R> = Promise<Either<string, R>>;

const getExecutor = (): Response<ExecutorUser> => fromPromise(fetchExecutor());
type RawClientUser = Omit<ClientUser, 'demands'> & { demands: Array<Demand> | null };

const getClients = (): Response<Array<ClientUser>> =>
  fromPromise<string, Array<RawClientUser>>(fetchClient()).then(
    map<string, Array<RawClientUser>, Array<ClientUser>>((clients) =>
      clients.map((client) => ({
        ...client,
        demands: fromNullable(client.demands),
      })),
    ),
  );

export enum SortBy {
  distance = 'distance',
  reward = 'reward',
}

export const show =
  (sortBy: SortBy) =>
  (clients: Array<ClientUser>) =>
  (executor: ExecutorUser): Either<string, string> => {
    type ClientWithStats = ClientUser & { distance: number; meetsDemands: boolean };

    const clientsWithStats: Array<ClientWithStats> = clients.map((client) => {
      const meetsDemands = pipe(
        client.demands,
        foldMaybe(
          () => true,
          (demands) => demands.every((demand) => executor.possibilities.includes(demand)),
        ),
      );

      return {
        ...client,
        distance: distance(executor.position, client.position),
        meetsDemands,
      };
    });

    const availableClients = clientsWithStats.filter((client) => client.meetsDemands);

    if (availableClients.length === 0) {
      return left('This executor cannot meet the demands of any client!');
    }

    const totalClients = clients.length;
    const summary =
      availableClients.length === totalClients
        ? 'This executor meets all demands of all clients!'
        : `This executor meets the demands of only ${availableClients.length} out of ${totalClients} clients`;

    const header =
      sortBy === SortBy.reward
        ? 'Available clients sorted by highest reward:'
        : 'Available clients sorted by distance to executor:';

    const ordByReward = revert(
      fromCompare<ClientWithStats>((a, b) => ordNumber.compare(a.reward, b.reward)),
    );
    const ordByDistance = fromCompare<ClientWithStats>((a, b) => ordNumber.compare(a.distance, b.distance));

    const sortedClients = (sortBy === SortBy.reward ? sort(ordByReward) : sort(ordByDistance))(availableClients);

    const rows = sortedClients
      .map((client) => `name: ${client.name}, distance: ${client.distance.toFixed(3)}, reward: ${client.reward}`)
      .join('\n');

    const result = `${summary}\n\n${header}\n${rows}`;

    return right(result);
  };

export const main = (sortBy: SortBy): Promise<string> =>
  Promise.all([getClients(), getExecutor()]) // Fetch clients and executor
    .then(([clients, executor]) =>
      pipe(
        /**
         * Since the "show" function takes two parameters, the value of which is inside Either
         * clients is Either<string, Array<Client>>, an executor is Either<string, Executor>. How to pass only Array<Client> and Executor to the show?
         * Either is an applicative type class, which means that we can apply each parameter by one
         */
        right(show(sortBy)), // Firstly, we need to lift our function to the Either
        ap(clients), // Apply first parameter
        ap(executor), // Apply second parameter
        flatten, // show at the end returns Either as well, so the result would be Either<string, Either<string, string>>. We need to flatten the result
        getOrElse((err) => err), // In case of any left (error) value, it would be stopped and show error. So, if clients or executor is left, the show would not be called, but onLeft in getOrElse would be called
      ),
    );
