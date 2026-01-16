import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { GetPhotoUseCase } from './get-photo.use-case';
import { PhotosRepository } from '../repositories/photos.repository';
import { StorageRepository } from '../../storage/repositories/storage.repository';

@Injectable()
export class DeletePhotosUseCase {
  constructor(
    private readonly photosRepository: PhotosRepository,
    private readonly storageRepository: StorageRepository,
    private readonly getPhotoUseCase: GetPhotoUseCase,
  ) {}

  async execute(ids: string[], userId: string): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    // Validate each photo individually and collect only valid ones
    const validPhotos: Array<{ id: string; photo: any }> = [];
    const invalidIds: string[] = [];

    for (const id of ids) {
      try {
        const photo = await this.getPhotoUseCase.execute(id, userId);
        validPhotos.push({ id, photo });
      } catch (error) {
        // Photo not found or doesn't belong to user - skip it
        console.warn(`Photo ${id} not found or access denied, skipping deletion`);
        invalidIds.push(id);
      }
    }

    if (validPhotos.length === 0) {
      // No valid photos to delete
      return;
    }

    // Delete files from R2 storage
    const deletePromises = validPhotos.map(async ({ photo }) => {
      const storageKey = `photos/${photo.filename}`;
      try {
        await this.storageRepository.deleteFile(storageKey);
      } catch (error) {
        console.error(`Error deleting file ${storageKey} from R2:`, error);
        // Continue with database deletion even if file deletion fails
      }
    });

    await Promise.all(deletePromises);

    // Delete from database only valid photo IDs
    const validIds = validPhotos.map(({ id }) => id);
    await this.photosRepository.deleteMany(validIds);
  }
}
